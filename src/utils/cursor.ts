/**
 * Cursor-based pagination utilities
 */

import { randomBytes } from 'crypto';

export interface CursorData {
  [key: string]: string | number | boolean | null;
}

export function encodeCursor(data: CursorData): string {
  const json = JSON.stringify(data);
  return Buffer.from(json).toString('base64url');
}

export function decodeCursor(cursor: string): CursorData | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    return JSON.parse(json) as CursorData;
  } catch {
    return null;
  }
}

export function generateCursor(
  items: unknown[],
  sortField: string,
  sortDirection: 'asc' | 'desc' = 'desc'
): string | null {
  if (items.length === 0) return null;
  
  const lastItem = items[items.length - 1] as Record<string, unknown>;
  const value = lastItem[sortField];
  
  if (value === undefined) return null;
  
  return encodeCursor({
    [sortField]: value as string | number | boolean | null,
    dir: sortDirection,
  });
}

export function getPaginationParams(
  cursor: string | undefined,
  limit: number,
  maxLimit: number = 100
): { decodedCursor: CursorData | null; safeLimit: number } {
  const safeLimit = Math.min(Math.max(1, limit), maxLimit);
  const decodedCursor = cursor ? decodeCursor(cursor) : null;
  
  return { decodedCursor, safeLimit };
}

export function generateRequestId(): string {
  return randomBytes(16).toString('hex');
}
