import { Worker } from "bullmq";
import prisma from "../lib/prisma";
import { createBullConnection } from "../lib/redis";
import { sendMail } from "../lib/mailer";
import { QUEUE_NAME, type InviteEmailJob } from "../queues/task.queue";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

export function startWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "invite-email": {
          const data = job.data as InviteEmailJob;
          await sendMail(
            data.email,
            `${data.inviterName} invited you to ${data.workspaceName}`,
            `You were invited as ${data.role}.\n` +
              `Accept: ${CLIENT_URL}/?invite=${data.token}\n` +
              `This invite expires in 48 hours.`
          );
          return;
        }

        case "daily-digest": {
          // Per-workspace summary of the last 24h, "sent" to the owner.
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const workspaces = await prisma.workspace.findMany({
            include: {
              memberships: {
                where: { role: "OWNER" },
                include: { user: true },
              },
            },
          });

          for (const workspace of workspaces) {
            const [created, activity] = await Promise.all([
              prisma.task.count({
                where: {
                  createdAt: { gte: since },
                  list: { board: { workspaceId: workspace.id } },
                },
              }),
              prisma.activityLog.count({
                where: { workspaceId: workspace.id, createdAt: { gte: since } },
              }),
            ]);

            for (const membership of workspace.memberships) {
              await sendMail(
                membership.user.email,
                `Daily digest for ${workspace.name}`,
                `${created} tasks created and ${activity} activity events in the last 24h.`
              );
            }
          }
          return;
        }

        default:
          console.warn(`[worker] unknown job: ${job.name}`);
      }
    },
    { connection: createBullConnection(), concurrency: 5 }
  );

  worker.on("completed", (job) =>
    console.log(`[worker] completed ${job.name} (${job.id})`)
  );
  worker.on("failed", (job, error) =>
    console.error(`[worker] failed ${job?.name} (${job?.id}):`, error.message)
  );
  worker.on("error", (error) =>
    console.error("[worker] error:", error.message)
  );

  console.log("[worker] background worker started");
  return worker;
}
