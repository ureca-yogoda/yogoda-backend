import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import jwt from "jsonwebtoken";
import { env } from "../src/core/config/env.ts";
import {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
} from "../src/core/security/jwt.ts";
import { isAllowedSocketOrigin } from "../src/core/middlewares/security.ts";
import { consumeChatQuota } from "../src/core/middlewares/rate-limit.ts";

const originalSecret = env.JWT_SECRET_KEY;
afterEach(() => {
  env.JWT_SECRET_KEY = originalSecret;
});
const userId = "507f1f77bcf86cd799439011";

test("only access tokens authenticate API and socket users", () => {
  env.JWT_SECRET_KEY = "isolated-test-secret";
  assert.equal(verifyAccessToken(createAccessToken({ userId })).userId, userId);
  assert.throws(() => verifyAccessToken(createRefreshToken({ userId })));
  assert.throws(() =>
    verifyAccessToken(jwt.sign({ userId, type: "admin" }, env.JWT_SECRET_KEY)),
  );
});
test("rejects expired, tampered and wrong-algorithm tokens", () => {
  env.JWT_SECRET_KEY = "isolated-test-secret";
  assert.throws(() =>
    verifyAccessToken(
      jwt.sign({ userId }, env.JWT_SECRET_KEY, { expiresIn: -1 }),
    ),
  );
  assert.throws(() => verifyAccessToken(jwt.sign({ userId }, "wrong-secret")));
  assert.throws(() =>
    verifyAccessToken(
      jwt.sign({ userId }, env.JWT_SECRET_KEY, { algorithm: "HS384" }),
    ),
  );
});
test("valid legacy access tokens remain valid during migration", () => {
  env.JWT_SECRET_KEY = "isolated-test-secret";
  assert.equal(
    verifyAccessToken(
      jwt.sign({ userId }, env.JWT_SECRET_KEY, { expiresIn: 60 }),
    ).userId,
    userId,
  );
});
test("websocket origins use an exact allowlist, not suffix matching", () => {
  const allowed = ["https://example.com"];
  assert.equal(isAllowedSocketOrigin("https://example.com", allowed), true);
  assert.equal(
    isAllowedSocketOrigin("https://example.com.attacker.test", allowed),
    false,
  );
  assert.equal(isAllowedSocketOrigin("null", allowed), false);
  assert.equal(isAllowedSocketOrigin(undefined, allowed), true);
});
test("chat quota applies across connections belonging to one user", async () => {
  for (let i = 0; i < 20; i++)
    await consumeChatQuota("rate-test-user", "rate-test-ip");
  await assert.rejects(consumeChatQuota("rate-test-user", "another-ip"));
});
