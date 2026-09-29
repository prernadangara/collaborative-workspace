import { Worker } from "bullmq";

const taskWorker = new Worker(
  "task-processing",
  async (job) => {
    console.log(
      `Processing background job: ${job.name}`,
      job.data
    );
  },
  {
    connection: {
      host: "localhost",
      port: 6379,
    },
  }
);

taskWorker.on("completed", (job) => {
  console.log(`Background job completed: ${job.id}`);
});

taskWorker.on("failed", (job, error) => {
  console.error(
    `Background job failed: ${job?.id}`,
    error.message
  );
});

console.log("Task background worker started");