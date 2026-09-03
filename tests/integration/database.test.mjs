import assert from "node:assert/strict";
import { before, after, afterEach, mock, test } from "node:test";
import {
  startHarness,
  seedFixture,
  UserMissionModel,
  UserCouponModel,
  PointTransactionModel,
} from "../support/harness.mjs";
import { claimMissionReward } from "../../src/services/mission.service.ts";
import { getPointWallet } from "../../src/services/point.service.ts";
import { revokeAvailableCouponsForUser } from "../../src/services/coupon.service.ts";

let harness;
before(async () => {
  harness = await startHarness();
});
after(async () => {
  await harness?.close();
});
afterEach(() => mock.restoreAll());
const request = (path, token, options = {}) =>
  globalThis.fetch(harness.url + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      ...options.headers,
    },
  });

test("HTTP authentication rejects refresh tokens and non-admin access", async () => {
  const fixture = await seedFixture();
  assert.equal(
    (await request("/api/notifications", fixture.refreshToken)).status,
    401,
  );
  assert.equal(
    (await request("/api/notifications", fixture.accessToken)).status,
    200,
  );
  assert.equal(
    (await request("/api/admin-check", fixture.accessToken)).status,
    403,
  );
});
test("logout invalidates the stored refresh token", async () => {
  const fixture = await seedFixture();
  const headers = { Cookie: "refreshToken=" + fixture.refreshToken };
  assert.equal(
    (
      await request("/api/auth/refresh", fixture.accessToken, {
        method: "POST",
        headers,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/api/auth/logout", fixture.accessToken, { method: "POST" }))
      .status,
    200,
  );
  assert.equal(
    (
      await request("/api/auth/refresh", fixture.accessToken, {
        method: "POST",
        headers,
      })
    ).status,
    401,
  );
});
test("parallel mission claims award points exactly once in MongoDB", async () => {
  const fixture = await seedFixture();
  const outcomes = await Promise.allSettled([
    claimMissionReward(fixture.user.userId, fixture.missionCode),
    claimMissionReward(fixture.user.userId, fixture.missionCode),
  ]);
  assert.equal(
    outcomes.filter((item) => item.status === "fulfilled").length,
    1,
  );
  assert.equal((await getPointWallet(fixture.user.userId)).balance, 100);
});
test("a point-credit failure rolls the actual mission record back", async () => {
  const fixture = await seedFixture();
  mock.method(PointTransactionModel, "findOneAndUpdate", async () => {
    throw new Error("injected credit failure");
  });
  await assert.rejects(
    claimMissionReward(fixture.user.userId, fixture.missionCode),
    /injected/,
  );
  const record = await UserMissionModel.findOne({
    user_id: fixture.user.userId,
    mission_id: fixture.missionId,
  });
  assert.equal(record.status, "completed");
  assert.equal(
    await PointTransactionModel.countDocuments({
      user_id: fixture.user.userId,
    }),
    0,
  );
});
test("foreign coupons cannot be used and duplicate use cannot succeed", async () => {
  const owner = await seedFixture();
  const stranger = await seedFixture();
  const path = "/api/coupons/me/" + owner.couponId + "/use";
  assert.equal(
    (await request(path, stranger.accessToken, { method: "PATCH" })).status,
    404,
  );
  const outcomes = await Promise.all([
    request(path, owner.accessToken, { method: "PATCH" }),
    request(path, owner.accessToken, { method: "PATCH" }),
  ]);
  assert.deepEqual(
    outcomes.map((response) => response.status).sort(),
    [200, 409],
  );
});
test("plan coupon revocation does not revoke purchased coupons in MongoDB", async () => {
  const fixture = await seedFixture();
  await revokeAvailableCouponsForUser(fixture.user.userId);
  assert.equal(
    (await UserCouponModel.findById(fixture.couponId)).status,
    "available",
  );
});
test("coupon wallet remains available without the optional coupon mission", async () => {
  const fixture = await seedFixture();
  const response = await request(
    "/api/coupons/me?status=all",
    fixture.accessToken,
  );
  assert.equal(response.status, 200);
  const wallet = await response.json();
  assert.equal(wallet.coupons[0].id, fixture.couponId);
  assert.equal(wallet.summary.available, 1);
});

test("read-all only changes the authenticated user's notifications", async () => {
  const owner = await seedFixture();
  const stranger = await seedFixture();
  assert.equal(
    (
      await request("/api/notifications/read-all", owner.accessToken, {
        method: "PATCH",
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await request("/api/notifications", owner.accessToken)).json())
      .unreadCount,
    0,
  );
  assert.equal(
    (await (await request("/api/notifications", stranger.accessToken)).json())
      .unreadCount,
    1,
  );
});

test("cross-site refresh requests are rejected even with a valid cookie", async () => {
  const fixture = await seedFixture();
  const response = await request("/api/auth/refresh", fixture.accessToken, {
    method: "POST",
    headers: {
      Cookie: "refreshToken=" + fixture.refreshToken,
      Origin: "https://untrusted.example",
      "Sec-Fetch-Site": "cross-site",
    },
  });
  assert.equal(response.status, 403);
});

test("subscription mutations cannot modify another user's record", async () => {
  const owner = await seedFixture();
  const stranger = await seedFixture();
  const input = {
    serviceCode: "netflix",
    serviceName: "Netflix",
    category: "ott",
    monthlyFee: 17000,
    startedAt: "2026-09-01T00:00:00.000Z",
  };
  const created = await request("/api/subscriptions/me", owner.accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
  assert.equal(created.status, 201);
  const { subscription } = await created.json();
  const path = "/api/subscriptions/me/" + subscription.id;
  assert.equal(
    (await request(path, stranger.accessToken, { method: "DELETE" })).status,
    404,
  );
  assert.equal(
    (
      await request(path, stranger.accessToken, {
        method: "PATCH",
        body: JSON.stringify({ monthlyFee: 0 }),
      })
    ).status,
    404,
  );
  const wallet = await (
    await request("/api/subscriptions/me", owner.accessToken)
  ).json();
  assert.equal(wallet.subscriptions[0].status, "active");
  assert.equal(wallet.subscriptions[0].monthlyFee, 17000);
});

test("subscription API rejects invalid inputs without creating records", async () => {
  const fixture = await seedFixture();
  const input = {
    serviceCode: "netflix",
    serviceName: "Netflix",
    category: "ott",
    monthlyFee: 17000,
    startedAt: "2026-09-01T00:00:00.000Z",
  };
  for (const invalid of [
    { monthlyFee: -1 },
    { monthlyFee: null },
    { monthlyFee: "17000" },
    { startedAt: "invalid" },
    { category: "unknown" },
  ]) {
    const response = await request(
      "/api/subscriptions/me",
      fixture.accessToken,
      { method: "POST", body: JSON.stringify({ ...input, ...invalid }) },
    );
    assert.equal(response.status, 400);
  }
  const wallet = await (
    await request("/api/subscriptions/me", fixture.accessToken)
  ).json();
  assert.equal(wallet.subscriptions.length, 0);
});

test("auth quota returns a browser-readable 429 with Retry-After", async () => {
  let response;
  for (let attempt = 0; attempt < 25; attempt++) {
    response = await request("/api/auth/refresh", "invalid", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:3100" },
    });
    if (response.status === 429) break;
  }
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://127.0.0.1:3100",
  );
});
