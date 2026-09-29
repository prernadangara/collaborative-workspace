import { Queue } from "bullmq";

const taskQueue = new Queue("task-processing", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

export default taskQueue;