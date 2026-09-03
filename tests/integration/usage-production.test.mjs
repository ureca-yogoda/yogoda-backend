import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import axios from "axios";
import { startHarness, seedFixture, UserModel } from "../support/harness.mjs";
import { env } from "../../src/core/config/env.ts";
import { PlanModel } from "../../src/models/plan.model.ts";
import { UserUsageSummaryModel } from "../../src/models/user-usage-summary.model.ts";
import { NotificationModel } from "../../src/models/notification.model.ts";

let harness;
before(async () => {
  harness = await startHarness();
  env.NODE_ENV = "production";
});
after(async () => {
  await harness?.close();
});

const request = (path, token, method = "GET") =>
  globalThis.fetch(harness.url + path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

async function subscribedUser() {
  const fixture = await seedFixture();
  const plan = await PlanModel.collection.insertOne({
    code: `demo-${fixture.user.userId}`,
    name: "Demo unlimited",
    monthly_fee: 75000,
    data: { amount_mb: null, display: "Unlimited" },
    is_active: true,
    tags: [],
    recommendation_tags: [],
  });
  await UserModel.updateOne(
    { _id: fixture.user.userId },
    { $set: { current_plan_id: plan.insertedId } },
  );
  return fixture;
}

test("production first read initializes demo usage once, not on every reload", async () => {
  const fixture = await subscribedUser();
  const response = await request("/api/usage/me", fixture.accessToken);
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.source, "demo");
  assert.equal(report.scenario, "baseline");
  assert.equal(report.history.length, 3);
  assert.equal(report.dataLimit, null);
  assert.equal(report.activeOttCount, 2);
  await UserUsageSummaryModel.updateOne(
    { user_id: fixture.user.userId, usage_month: report.period },
    { $set: { data_usage_gb: 42 } },
  );
  assert.equal(
    (await (await request("/api/usage/me", fixture.accessToken)).json())
      .dataUsed,
    42,
  );
});

test("production demo stages update usage, subscriptions, notification and recommendation", async () => {
  const fixture = await subscribedUser();
  const candidateCode = `cheaper-${fixture.user.userId}`;
  await PlanModel.collection.insertOne({
    code: candidateCode,
    name: "Demo 40GB",
    monthly_fee: 39000,
    data: { amount_mb: 40 * 1024, display: "40GB" },
    is_active: true,
    tags: [],
    recommendation_tags: [],
  });
  const path = "/api/usage/me/demo/usage-drop";
  const response = await request(path, fixture.accessToken, "POST");
  assert.equal(response.status, 200);
  const result = await response.json();
  const report = result.report;
  assert.equal(report.history.length, 6);
  assert.equal(report.activeOttCount, 0);
  assert.ok(report.changeRate <= -20);
  await request(path, fixture.accessToken, "POST");
  assert.equal(
    await NotificationModel.countDocuments({
      user_id: fixture.user.userId,
      dedupe_key: `usage_pattern_changed:${report.period}`,
    }),
    1,
  );

  const adapter = axios.defaults.adapter;
  axios.defaults.adapter = async (config) => {
    assert.ok(String(config.data).includes(candidateCode));
    return {
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      data: {
        steps: [
          {
            type: "model_output",
            content: [
              {
                text: JSON.stringify({
                  selectedCode: candidateCode,
                  headline: "Test recommendation",
                  reason: "Test explanation",
                }),
              },
            ],
          },
        ],
      },
    };
  };
  try {
    const recommendationResponse = await request(
      "/api/usage/me/recommendation",
      fixture.accessToken,
      "POST",
    );
    assert.equal(recommendationResponse.status, 200);
    const recommendation = await recommendationResponse.json();
    assert.equal(recommendation.recommendedPlan.code, candidateCode);
    assert.equal(recommendation.monthlySavings, 36000);
    assert.equal(recommendation.analysisSource, "ai");
  } finally {
    axios.defaults.adapter = adapter;
  }
  const reset = await request(
    "/api/usage/me/demo/baseline",
    fixture.accessToken,
    "POST",
  );
  assert.equal(reset.status, 200);
  const baseline = (await reset.json()).report;
  assert.equal(baseline.history.length, 3);
  assert.equal(baseline.activeOttCount, 2);
});

test("production demo still requires authentication and a current plan", async () => {
  assert.equal(
    (await request("/api/usage/me/demo/baseline", null, "POST")).status,
    401,
  );
  const fixture = await seedFixture();
  assert.equal(
    (await request("/api/usage/me/demo/baseline", fixture.accessToken, "POST"))
      .status,
    409,
  );
  assert.equal(
    await UserUsageSummaryModel.countDocuments({
      user_id: fixture.user.userId,
    }),
    0,
  );
});
