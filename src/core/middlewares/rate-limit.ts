import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import type { RequestHandler } from "express";

const httpQuota = new RateLimiterMemory({
  points: 180,
  duration: 60,
  blockDuration: 30,
});
const expensiveQuota = new RateLimiterMemory({
  points: 20,
  duration: 60,
  blockDuration: 30,
});
const chatUserQuota = new RateLimiterMemory({
  points: 20,
  duration: 60,
  blockDuration: 30,
});
const chatIpQuota = new RateLimiterMemory({
  points: 120,
  duration: 60,
  blockDuration: 30,
});

export const apiRateLimit: RequestHandler = async (req, res, next) => {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    await httpQuota.consume(ip);
    if (
      /\/(?:auth|ai-compare|analyze|analysis|recommendation)(?:\/|$)/.test(
        req.path,
      )
    ) {
      await expensiveQuota.consume(ip);
    }
    next();
  } catch (error) {
    const seconds =
      error instanceof RateLimiterRes
        ? Math.ceil(error.msBeforeNext / 1000)
        : 60;
    res.set("Retry-After", String(Math.max(1, seconds)));
    res
      .status(429)
      .json({ message: "요청이 많아요. 잠시 후 다시 시도해 주세요." });
  }
};

export async function consumeChatQuota(userId: string | null, ip: string) {
  await chatIpQuota.consume(ip);
  if (userId) await chatUserQuota.consume(userId);
}
