import type { RequestHandler } from "express";

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy":
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  });
  next();
};

export function isAllowedSocketOrigin(
  origin: string | undefined,
  allowedOrigins: string[],
) {
  // Native clients may omit Origin; authentication and quotas still apply.
  return origin === undefined || allowedOrigins.includes(origin);
}
