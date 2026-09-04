import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import mongoose from "mongoose";
import {
  assertSignupReady,
  validateIdentityInput,
} from "../src/services/signup-validation.ts";
import {
  syncEligibleCouponsForUser,
  revokeAvailableCouponsForUser,
} from "../src/services/coupon.service.ts";
import { claimMissionReward } from "../src/services/mission.service.ts";
import { UserModel } from "../src/models/user.model.ts";
import { PlanModel } from "../src/models/plan.model.ts";
import { BenefitModel } from "../src/models/benefit.model.ts";
import { UserCouponModel } from "../src/models/user-coupon.model.ts";
import { MissionModel } from "../src/models/mission.model.ts";
import { UserMissionModel } from "../src/models/user-mission.model.ts";
import { PointTransactionModel } from "../src/models/point-transaction.model.ts";

afterEach(() => mock.restoreAll());

const valid = {
  fraudWarningAcknowledged: true,
  agreedToTerms: true,
  identityVerified: true,
  name: "Tester",
  birth: "19990101",
  phoneNumber: "01012345678",
  paymentMethod: "신용카드",
};
const benefit = {
  code: "ott",
  required: true,
  selectionCount: 1,
  options: [{ code: "tving" }],
};

test("requires server final-confirm stage and all confirmations", () => {
  assert.doesNotThrow(() => assertSignupReady("final_confirm", valid, []));
  assert.throws(() => assertSignupReady("fraud_warning", valid, []));
  for (const key of [
    "fraudWarningAcknowledged",
    "agreedToTerms",
    "identityVerified",
  ]) {
    assert.throws(() =>
      assertSignupReady("final_confirm", { ...valid, [key]: false }, []),
    );
  }
});
test("rejects missing identity, payment and invalid benefit choices", () => {
  assert.throws(() => validateIdentityInput(undefined));
  assert.throws(() =>
    assertSignupReady(
      "final_confirm",
      { ...valid, paymentMethod: undefined },
      [],
    ),
  );
  assert.throws(() => assertSignupReady("final_confirm", valid, [benefit]));
  assert.throws(() =>
    assertSignupReady(
      "final_confirm",
      { ...valid, selectedBenefits: { ott: ["unknown"] } },
      [benefit],
    ),
  );
  assert.throws(() =>
    assertSignupReady(
      "final_confirm",
      { ...valid, selectedBenefits: { ott: ["tving", "tving"] } },
      [benefit],
    ),
  );
  assert.doesNotThrow(() =>
    assertSignupReady(
      "final_confirm",
      { ...valid, selectedBenefits: { ott: ["tving"] } },
      [benefit],
    ),
  );
});
test("plan cancellation only revokes monthly coupons, never point exchanges", async () => {
  const update = mock.method(UserCouponModel, "updateMany", async () => ({}));
  await revokeAvailableCouponsForUser("user");
  const filter = update.mock.calls[0].arguments[0];
  assert.equal(filter.status, "available");
  assert.equal(filter.issuance_key.test("2026-09"), true);
  assert.equal(filter.issuance_key.test("point-exchange:purchase"), false);
});
test("coupon sync restores only unused eligible monthly coupons", async () => {
  mock.method(UserModel, "findById", () => ({
    select: () => ({
      lean: async () => ({ _id: "user", current_plan_id: "plan" }),
    }),
  }));
  mock.method(PlanModel, "findById", () => ({
    select: () => ({
      lean: async () => ({
        code: "plan",
        monthly_fee: 50000,
        membership_tier: "vip",
      }),
    }),
  }));
  mock.method(BenefitModel, "find", () => ({
    lean: async () => [
      { _id: "benefit", minMembershipTier: null, end_date: null },
    ],
  }));
  const update = mock.method(UserCouponModel, "updateMany", async () => ({}));
  const bulk = mock.method(UserCouponModel, "bulkWrite", async () => ({}));
  await syncEligibleCouponsForUser("user");
  assert.deepEqual(update.mock.calls[0].arguments[0].benefit_id, {
    $nin: ["benefit"],
  });
  const restore = update.mock.calls[1].arguments[0];
  assert.equal(restore.status, "revoked");
  assert.equal(restore.used_at, null);
  assert.ok(restore.expires_at.$gt instanceof Date);
  assert.match(restore.issuance_key, /^\d{4}-\d{2}$/);
  assert.ok(bulk.mock.calls[0].arguments[0][0].updateOne.update.$setOnInsert);
});
test("mission claim and point credit use the same transaction session", async () => {
  const session = {};
  mock.method(mongoose.connection, "transaction", async (run) => run(session));
  mock.method(MissionModel, "findOne", async () => ({
    _id: "mission",
    code: "test",
    title: "Test",
    reward_points: 100,
  }));
  const claim = mock.method(UserMissionModel, "findOneAndUpdate", async () => ({
    status: "claimed",
  }));
  const points = mock.method(
    PointTransactionModel,
    "findOneAndUpdate",
    async () => ({}),
  );
  const result = await claimMissionReward("user", "test");
  assert.equal(result.points, 100);
  assert.equal(claim.mock.calls[0].arguments[2].session, session);
  assert.equal(points.mock.calls[0].arguments[2].session, session);
});
test("point failure rejects the transaction instead of reporting a claimed reward", async () => {
  let aborted = false;
  mock.method(mongoose.connection, "transaction", async (run) => {
    try {
      return await run({});
    } catch (error) {
      aborted = true;
      throw error;
    }
  });
  mock.method(MissionModel, "findOne", async () => ({
    _id: "mission",
    code: "test",
    title: "Test",
    reward_points: 100,
  }));
  mock.method(UserMissionModel, "findOneAndUpdate", async () => ({
    status: "claimed",
  }));
  mock.method(PointTransactionModel, "findOneAndUpdate", async () => {
    throw new Error("credit failed");
  });
  await assert.rejects(claimMissionReward("user", "test"), /credit failed/);
  assert.equal(aborted, true);
});
