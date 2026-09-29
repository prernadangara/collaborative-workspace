import Redis from "ioredis";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// maxRetriesPerRequest: null is required by BullMQ workers and is safe for
// the cache client too (commands queue while reconnecting instead of failing).
function createRedis() {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  });

  client.on("error", (error) => {
    console.error("[redis] error:", error.message);
  });

  return client;
}

const redis = createRedis();

// Separate connection for BullMQ (it needs blocking commands + offline queue).
export function createBullConnection() {
  const client = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  client.on("error", (error) => {
    console.error("[redis:bullmq] error:", error.message);
  });
  return client;
}

export default redis;
