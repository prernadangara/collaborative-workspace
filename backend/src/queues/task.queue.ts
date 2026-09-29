import { Queue } from "bullmq";
import { createBullConnection } from "../lib/redis";

export const QUEUE_NAME = "background-jobs";

export type InviteEmailJob = {
  inviteId: string;
  email: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  token: string;
};

const queue = new Queue(QUEUE_NAME, {
  connection: createBullConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

queue.on("error", (error) => {
  console.error("[queue] error:", error.message);
});

const ENQUEUE_TIMEOUT_MS = 1500;

/**
 * Enqueue without ever failing or hanging the request that triggered it.
 * BullMQ waits indefinitely for Redis, so we race it against a timeout.
 * Returns false if the job could not be queued; callers may fall back.
 */
export async function enqueue(name: string, data: unknown): Promise<boolean> {
  try {
    await Promise.race([
      queue.add(name, data),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("enqueue timed out")), ENQUEUE_TIMEOUT_MS)
      ),
    ]);
    return true;
  } catch (error) {
    console.error(`[queue] could not enqueue ${name}:`, (error as Error).message);
    return false;
  }
}

export async function scheduleDailyDigest() {
  try {
    await queue.upsertJobScheduler(
      "daily-digest-scheduler",
      { pattern: "0 8 * * *" },
      { name: "daily-digest", data: {} }
    );
  } catch (error) {
    console.error("[queue] could not schedule digest:", (error as Error).message);
  }
}

export default queue;
