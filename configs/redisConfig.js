import "dotenv/config";

export const redisConnection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB || 0),
  tls:
    process.env.REDIS_TLS === "true"
      ? { rejectUnauthorized: false }
      : undefined,
};

export function redisUrl() {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const auth = process.env.REDIS_PASSWORD
    ? `:${encodeURIComponent(process.env.REDIS_PASSWORD)}@`
    : "";
  return `redis://${auth}${process.env.REDIS_HOST || "127.0.0.1"}:${process.env.REDIS_PORT || 6379}/${process.env.REDIS_DB || 0}`;
}
