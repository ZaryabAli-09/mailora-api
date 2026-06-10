import { Queue, QueueScheduler, Worker } from "bullmq";
import { redisConnection } from "../configs/redisConfig.js";

const MAIL_QUEUE_NAME = "mail-queue";

export const mailQueue = new Queue(MAIL_QUEUE_NAME, {
  connection: redisConnection,
});

export const mailQueueScheduler = new QueueScheduler(MAIL_QUEUE_NAME, {
  connection: redisConnection,
});

export const mailWorker = new Worker(
  MAIL_QUEUE_NAME,
  async (job) => {
    switch (job.name) {
      case "send-email":
        console.log("Processing email job", job.data);
        return { status: "queued" };
      default:
        throw new Error(`Unknown mail queue job type: ${job.name}`);
    }
  },
  { connection: redisConnection },
);

mailWorker.on("completed", (job) => {
  console.log(`✔️ Mail job completed: ${job.id} (${job.name})`);
});

mailWorker.on("failed", (job, err) => {
  console.error(`❌ Mail job failed: ${job.id} (${job.name})`, err);
});

export async function addMailJob(data) {
  return mailQueue.add("send-email", data, {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  });
}
