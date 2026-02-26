-- Seed data for DeFi Data API
-- Sample protocols and pools for testing

-- Insert sample protocols
INSERT INTO protocols (id, slug, name, chain_ids, category, url, audit_status, tvl_usd) VALUES
('aave-v3', 'aave-v3', 'Aave V3', ARRAY['ethereum', 'arbitrum', 'base', 'polygon'], 'lending', 'https://aave.com', 'audited', 15000000000),
('compound-v3', 'compound-v3', 'Compound V3', ARRAY['ethereum', 'arbitrum', 'base', 'polygon'], 'lending', 'https://compound.finance', 'audited', 4500000000),
('uniswap-v3', 'uniswap-v3', 'Uniswap V3', ARRAY['ethereum', 'arbitrum', 'base', 'polygon', 'optimism'], 'dex', 'https://uniswap.org', 'audited', 4200000000),
('curve', 'curve', 'Curve Finance', ARRAY['ethereum', 'arbitrum', 'base', 'polygon'], 'dex', 'https://curve.fi', 'audited', 2800000000),
('lido', 'lido', 'Lido', ARRAY['ethereum'], 'liquid-staking', 'https://lido.fi', 'audited', 25000000000),
('yearn', 'yearn', 'Yearn Finance', ARRAY['ethereum', 'arbitrum', 'base', 'optimism'], 'yield-aggregator', 'https://yearn.fi', 'audited', 800000000)
ON CONFLICT (id) DO NOTHING;

-- Insert sample pools
INSERT INTO pools (id, protocol_id, chain_id, address, token0_symbol, token0_address, token0_decimals, pool_type, created_at) VALUES
('aave-v3-eth-weth', 'aave-v3', 'ethereum', '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', 'WETH', '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 18, 'lending', NOW()),
('aave-v3-eth-usdc', 'aave-v3', 'ethereum', '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', 'USDC', '0xa0b86a33e6776808dc56eb68bb0a0e18e3e3d4c9', 6, 'lending', NOW()),
('aave-v3-eth-usdt', 'aave-v3', 'ethereum', '0x23878914EFE38d27Cc4D8A9d1eE5E4c9aF1F9C3D', 'USDT', '0xdac17f958d2ee523a2206206994597c13d831ec7', 6, 'lending', NOW()),
('aave-v3-arb-weth', 'aave-v3', 'arbitrum', '0xe50fA9b3c56FfB159cB0FCA61F5c9D750e8128c8', 'WETH', '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', 18, 'lending', NOW()),
('compound-v3-eth-usdc', 'compound-v3', 'ethereum', '0xc3d688B66703497DAA19211EEdff47f25384cdc3', 'USDC', '0xa0b86a33e6776808dc56eb68bb0a0e18e3e3d4c9', 6, 'lending', NOW()),
('compound-v3-arb-usdc', 'compound-v3', 'arbitrum', '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf', 'USDC', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 6, 'lending', NOW()),
('lido-eth-steth', 'lido', 'ethereum', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', 'stETH', '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', 18, 'staking', NOW()),
('yearn-eth-yveth', 'yearn', 'ethereum', '0xa258C4606Ca8206D812a9e34e5259F5c2d17aC24', 'yvETH', '0xa258c4606ca8206d812a9e34e5259f5c2d17ac24', 18, 'vault', NOW()),
('yearn-eth-yvusdc', 'yearn', 'ethereum', '0xa354F35829Ae975e850e23e9615b11Da1BEd25c1', 'yvUSDC', '0xa354f35829ae975e850e23e9615b11da1bed25c1', 6, 'vault', NOW())
ON CONFLICT (id) DO NOTHING;

-- Insert sample yield data
INSERT INTO yields (pool_id, timestamp, apy_base, apy_reward, apy_total, tvl_usd) VALUES
('aave-v3-eth-weth', NOW(), 2.5, 0.8, 3.3, 850000000),
('aave-v3-eth-usdc', NOW(), 4.2, 1.1, 5.3, 420000000),
('aave-v3-eth-usdt', NOW(), 3.8, 0.9, 4.7, 380000000),
('aave-v3-arb-weth', NOW(), 2.1, 1.5, 3.6, 120000000),
('compound-v3-eth-usdc', NOW(), 4.5, 0, 4.5, 290000000),
('compound-v3-arb-usdc', NOW(), 3.9, 0, 3.9, 85000000),
('lido-eth-steth', NOW(), 3.2, 0, 3.2, 15000000000),
('yearn-eth-yveth', NOW(), 2.8, 0, 2.8, 45000000),
('yearn-eth-yvusdc', NOW(), 5.1, 0, 5.1, 32000000)
ON CONFLICT DO NOTHING;

-- Insert sample API keys for testing
-- Free tier key (key: test-free-key-12345)
INSERT INTO api_keys (id, user_id, key_hash, tier, rate_limit, request_quota, active) VALUES
('key_free_001', 'user_001', 'fad5f0804e2959a6c49604ad9981b9656690ad54e1f758fb652ab818d689a3a6', 'free', 10, 1000, true),
('key_builder_001', 'user_002', 'b1770b4b3ff731818a4f989ddd1fa5d88d786ccef8b3600ed308bcf784137207', 'builder', 100, 50000, true)
ON CONFLICT (id) DO NOTHING;

-- Insert sample token prices
INSERT INTO token_prices (token_address, chain_id, timestamp, price_usd, source) VALUES
('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 'ethereum', NOW() - INTERVAL '2 days', 2975.12, 'seed'),
('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 'ethereum', NOW() - INTERVAL '1 day', 3012.44, 'seed'),
('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 'ethereum', NOW(), 3058.91, 'seed'),
('0xa0b86a33e6776808dc56eb68bb0a0e18e3e3d4c9', 'ethereum', NOW() - INTERVAL '2 days', 1.00, 'seed'),
('0xa0b86a33e6776808dc56eb68bb0a0e18e3e3d4c9', 'ethereum', NOW() - INTERVAL '1 day', 1.00, 'seed'),
('0xa0b86a33e6776808dc56eb68bb0a0e18e3e3d4c9', 'ethereum', NOW(), 1.00, 'seed'),
('0xdac17f958d2ee523a2206206994597c13d831ec7', 'ethereum', NOW() - INTERVAL '2 days', 1.00, 'seed'),
('0xdac17f958d2ee523a2206206994597c13d831ec7', 'ethereum', NOW() - INTERVAL '1 day', 1.00, 'seed'),
('0xdac17f958d2ee523a2206206994597c13d831ec7', 'ethereum', NOW(), 1.00, 'seed'),
('0x82af49447d8a07e3bd95bd0d56f35241523fbab1', 'arbitrum', NOW() - INTERVAL '2 days', 2962.33, 'seed'),
('0x82af49447d8a07e3bd95bd0d56f35241523fbab1', 'arbitrum', NOW() - INTERVAL '1 day', 3001.71, 'seed'),
('0x82af49447d8a07e3bd95bd0d56f35241523fbab1', 'arbitrum', NOW(), 3048.27, 'seed'),
('0xaf88d065e77c8cc2239327c5edb3a432268e5831', 'arbitrum', NOW() - INTERVAL '2 days', 1.00, 'seed'),
('0xaf88d065e77c8cc2239327c5edb3a432268e5831', 'arbitrum', NOW() - INTERVAL '1 day', 1.00, 'seed'),
('0xaf88d065e77c8cc2239327c5edb3a432268e5831', 'arbitrum', NOW(), 1.00, 'seed')
ON CONFLICT DO NOTHING;
