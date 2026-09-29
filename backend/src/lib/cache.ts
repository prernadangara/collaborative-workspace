import redis from "./redis";

/**
 * Cache helpers. Redis is an optimisation, never a dependency for
 * correctness: every helper swallows errors so a Redis outage degrades to
 * "slower" instead of "500".
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.error("[cache] get failed:", (error as Error).message);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number
) {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    console.error("[cache] set failed:", (error as Error).message);
  }
}

export async function cacheDel(...keys: string[]) {
  try {
    if (keys.length) await redis.del(...keys);
  } catch (error) {
    console.error("[cache] del failed:", (error as Error).message);
  }
}

export const boardCacheKey = (workspaceId: string, boardId: string) =>
  `workspace:${workspaceId}:board:${boardId}`;

export const summaryCacheKey = (workspaceId: string) =>
  `workspace:${workspaceId}:summary`;
