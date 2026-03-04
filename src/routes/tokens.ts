/**
 * Token endpoints
 * GET /v1/tokens/:address
 * GET /v1/tokens/:address/price/history
 * GET /v1/tokens/search
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createResponseMeta, sendSuccess, Errors } from '../utils/response.js';
import { isDateRangeValid, resolveDateRange } from '../utils/date-range.js';
import {
  buildChainLimitMessage,
  buildHistoryLimitMessage,
  getAllowedChains,
  getDefaultHistoryLookbackDays,
  isChainAllowed,
  isDateWithinHistoryWindow,
} from '../utils/tier.js';
import { db, pools, tokenPrices } from '../db/index.js';
import { eq, and, gte, lte, desc, asc, inArray, sql, or } from 'drizzle-orm';

const tokenQuerySchema = z.object({
  chain: z.string().default('ethereum'),
});

const priceHistorySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  chain: z.string().optional().default('ethereum'),
});

const searchQuerySchema = z.object({
  q: z.string().min(1).max(50),
  chain: z.string().optional(),
});

interface TokenInfo {
  address: string;
  chainId: string;
  symbol: string;
  name: string;
  decimals: number;
  priceUsd: number | null;
  updatedAt: Date | null;
}

export default async function tokenRoutes(fastify: FastifyInstance) {
  // GET /v1/tokens/:address - Get token info
  fastify.get('/:address', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { address } = request.params as { address: string };
    
    const parseResult = tokenQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }
    
    const { chain } = parseResult.data;
    const normalizedChain = chain.toLowerCase();
    if (!isChainAllowed(normalizedChain, request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
      return;
    }
    
    try {
      // Get latest price for the token
      const latestPrice = await db.query.tokenPrices.findFirst({
        where: and(
          eq(tokenPrices.tokenAddress, address.toLowerCase()),
          eq(tokenPrices.chainId, normalizedChain)
        ),
        orderBy: desc(tokenPrices.timestamp),
      });
      
      // Try to get token info from pools (where it appears as token0 or token1)
      const pool = await db.query.pools.findFirst({
        where: or(
          and(
            eq(pools.token0Address, address.toLowerCase()),
            eq(pools.chainId, normalizedChain)
          ),
          and(
            eq(pools.token1Address, address.toLowerCase()),
            eq(pools.chainId, normalizedChain)
          )
        ),
      });
      
      if (!pool && !latestPrice) {
        Errors.NOT_FOUND(reply, meta, 'Token');
        return;
      }
      
      // Determine if token is token0 or token1 in the pool
      const isToken0 = pool?.token0Address.toLowerCase() === address.toLowerCase();
      
      const tokenInfo: TokenInfo = {
        address: address.toLowerCase(),
        chainId: normalizedChain,
        symbol: isToken0 ? pool!.token0Symbol : (pool?.token1Symbol || 'UNKNOWN'),
        name: isToken0 ? pool!.token0Symbol : (pool?.token1Symbol || 'Unknown Token'),
        decimals: isToken0 ? pool!.token0Decimals : (pool?.token1Decimals || 18),
        priceUsd: latestPrice?.priceUsd ?? null,
        updatedAt: latestPrice?.timestamp ?? null,
      };
      
      sendSuccess(reply, tokenInfo, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // GET /v1/tokens/:address/price/history
  fastify.get('/:address/price/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    const { address } = request.params as { address: string };
    
    const parseResult = priceHistorySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid query parameters');
      return;
    }
    
    const { from, to, chain } = parseResult.data;
    const normalizedChain = chain.toLowerCase();
    if (!isChainAllowed(normalizedChain, request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
      return;
    }

    const defaultLookbackDays = getDefaultHistoryLookbackDays(30, request.apiKey?.tier);
    const { from: fromDate, to: toDate } = resolveDateRange(from, to, defaultLookbackDays);

    if (!isDateRangeValid({ from: fromDate, to: toDate })) {
      Errors.BAD_REQUEST(reply, meta, '`from` must be before `to`');
      return;
    }

    if (!isDateWithinHistoryWindow(fromDate, request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, buildHistoryLimitMessage(request.apiKey?.tier));
      return;
    }
    
    try {
      const history = await db
        .select({
          timestamp: sql<Date>`DATE_TRUNC('day', ${tokenPrices.timestamp})`.as('date'),
          priceUsd: sql<number>`AVG(${tokenPrices.priceUsd})`.as('avg_price'),
        })
        .from(tokenPrices)
        .where(
          and(
            eq(tokenPrices.tokenAddress, address.toLowerCase()),
            eq(tokenPrices.chainId, normalizedChain),
            gte(tokenPrices.timestamp, fromDate),
            lte(tokenPrices.timestamp, toDate)
          )
        )
        .groupBy(sql`DATE_TRUNC('day', ${tokenPrices.timestamp})`)
        .orderBy(asc(sql`DATE_TRUNC('day', ${tokenPrices.timestamp})`));
      
      if (history.length === 0) {
        // Check if token exists
        const tokenExists = await db.query.tokenPrices.findFirst({
          where: and(
            eq(tokenPrices.tokenAddress, address.toLowerCase()),
            eq(tokenPrices.chainId, normalizedChain)
          ),
        });
        
        if (!tokenExists) {
          // Try to find in pools
          const pool = await db.query.pools.findFirst({
            where: or(
              eq(pools.token0Address, address.toLowerCase()),
              eq(pools.token1Address, address.toLowerCase())
            ),
          });
          
          if (!pool) {
            Errors.NOT_FOUND(reply, meta, 'Token');
            return;
          }
        }
      }
      
      sendSuccess(
        reply,
        history.map((h) => ({
          timestamp: h.timestamp,
          priceUsd: Number((h.priceUsd ?? 0).toFixed(6)),
        })),
        meta
      );
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
  
  // GET /v1/tokens/search - Search tokens by symbol or address
  fastify.get('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const meta = createResponseMeta();
    
    const parseResult = searchQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      Errors.BAD_REQUEST(reply, meta, 'Invalid search query');
      return;
    }
    
    const { q, chain } = parseResult.data;
    const requestedChain = chain?.toLowerCase();
    if (requestedChain && !isChainAllowed(requestedChain, request.apiKey?.tier)) {
      Errors.FORBIDDEN(reply, meta, buildChainLimitMessage(request.apiKey?.tier));
      return;
    }

    const tierChainFilter = !requestedChain ? getAllowedChains(request.apiKey?.tier) : null;
    const searchTerm = q.toLowerCase();
    
    try {
      // Search in pools for token0 and token1
      const poolResults = await db.query.pools.findMany({
        where: requestedChain
          ? eq(pools.chainId, requestedChain)
          : tierChainFilter
            ? inArray(pools.chainId, tierChainFilter)
            : undefined,
        limit: 50,
      });
      
      // Extract unique tokens
      const tokenMap = new Map<string, TokenInfo>();
      
      for (const pool of poolResults) {
        // Token0
        if (
          pool.token0Symbol.toLowerCase().includes(searchTerm) ||
          pool.token0Address.toLowerCase().includes(searchTerm)
        ) {
          const key = `${pool.chainId}-${pool.token0Address}`;
          if (!tokenMap.has(key)) {
            tokenMap.set(key, {
              address: pool.token0Address,
              chainId: pool.chainId,
              symbol: pool.token0Symbol,
              name: pool.token0Symbol,
              decimals: pool.token0Decimals,
              priceUsd: null,
              updatedAt: null,
            });
          }
        }
        
        // Token1
        if (
          pool.token1Symbol &&
          (pool.token1Symbol.toLowerCase().includes(searchTerm) ||
            pool.token1Address?.toLowerCase().includes(searchTerm))
        ) {
          const key = `${pool.chainId}-${pool.token1Address}`;
          if (!tokenMap.has(key)) {
            tokenMap.set(key, {
              address: pool.token1Address || '',
              chainId: pool.chainId,
              symbol: pool.token1Symbol,
              name: pool.token1Symbol,
              decimals: pool.token1Decimals || 18,
              priceUsd: null,
              updatedAt: null,
            });
          }
        }
      }
      
      const tokens = Array.from(tokenMap.values()).slice(0, 20);
      
      // Fetch latest prices for found tokens
      if (tokens.length > 0) {
        const tokenAddresses = tokens.map((t) => t.address);
        const prices = await db
          .selectDistinctOn([tokenPrices.tokenAddress, tokenPrices.chainId], {
            tokenAddress: tokenPrices.tokenAddress,
            chainId: tokenPrices.chainId,
            priceUsd: tokenPrices.priceUsd,
            timestamp: tokenPrices.timestamp,
          })
          .from(tokenPrices)
          .where(sql`${tokenPrices.tokenAddress} = ANY(${tokenAddresses})`)
          .orderBy(tokenPrices.tokenAddress, tokenPrices.chainId, desc(tokenPrices.timestamp));
        
        const priceMap = new Map(
          prices.map((p) => [`${p.chainId}-${p.tokenAddress}`, p])
        );
        
        for (const token of tokens) {
          const price = priceMap.get(`${token.chainId}-${token.address}`);
          if (price) {
            token.priceUsd = price.priceUsd;
            token.updatedAt = price.timestamp;
          }
        }
      }
      
      sendSuccess(reply, tokens, meta);
    } catch (error) {
      request.log.error(error);
      Errors.INTERNAL_ERROR(reply, meta);
    }
  });
}
