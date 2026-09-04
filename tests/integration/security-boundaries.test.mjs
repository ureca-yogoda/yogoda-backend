import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startHarness, seedFixture, UserModel } from "../support/harness.mjs";

let harness;
before(async () => {
  harness = await startHarness();
});
after(async () => {
  await harness?.close();
});

test("direct REST signup cannot bypass server-owned chat confirmation", async () => {
  const fixture = await seedFixture();
  const before = await UserModel.findById(fixture.user.userId).lean();
  for (const [action, method] of [
    ["join", "POST"],
    ["change", "PATCH"],
  ]) {
    const url = harness.url + `/api/plans/arbitrary/${action}`;
    assert.equal((await globalThis.fetch(url, { method })).status, 401);
    const response = await globalThis.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${fixture.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        selectedOptions: {},
        identityVerified: true,
        agreedToTerms: true,
        confirmed: true,
      }),
    });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).code, "SIGNUP_FLOW_REQUIRED");
  }
  const after = await UserModel.findById(fixture.user.userId).lean();
  assert.deepEqual(after.current_plan_id, before.current_plan_id);
});

test("HttpOnly refresh session returns verified profile without exposing refresh secret", async () => {
  const fixture = await seedFixture();
  const response = await globalThis.fetch(harness.url + "/api/auth/refresh", {
    method: "POST",
    headers: { Cookie: `refreshToken=${fixture.refreshToken}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert.equal(data.user.userId, fixture.user.userId);
  assert.equal(data.user.role, "user");
  assert.equal(typeof data.accessToken, "string");
  assert.equal(JSON.stringify(data).includes(fixture.refreshToken), false);
});

test("small concurrent authenticated read burst succeeds on an isolated database", async () => {
  const fixture = await seedFixture();
  const samples = await Promise.all(
    Array.from({ length: 25 }, async () => {
      const start = globalThis.performance.now();
      const response = await globalThis.fetch(
        harness.url + "/api/notifications",
        { headers: { Authorization: `Bearer ${fixture.accessToken}` } },
      );
      await response.json();
      assert.equal(response.status, 200);
      return globalThis.performance.now() - start;
    }),
  );
  samples.sort((a, b) => a - b);
  globalThis.console.log(
    JSON.stringify({
      requests: 25,
      concurrency: 25,
      p95Ms: Math.round(samples[23]),
      maxMs: Math.round(samples[24]),
      environment: "temporary MongoDB, not production load testing",
    }),
  );
});
