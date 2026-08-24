import { randomBytes } from "node:crypto";

import { isValidObjectId, Types } from "mongoose";

import { BenefitModel } from "../models/benefit.model.js";
import { PlanModel } from "../models/plan.model.js";
import { UserCouponModel } from "../models/user-coupon.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/AppError.js";
import { meetsMembershipTier } from "./benefit-eligibility.js";

export type CouponFilter =
  "available" | "expiring" | "used" | "expired" | "all";

const EXPIRING_DAYS = 7;

function getIssuanceKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getEndOfMonth(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1,
  );
}

function createCouponNumber() {
  return randomBytes(6)
    .toString("hex")
    .toUpperCase()
    .match(/.{1,4}/g)!
    .join("-");
}

function createBarcodeValue() {
  return randomBytes(16).toString("hex").toUpperCase();
}

/*
 * 로그인 사용자의 현재 요금제 조건에 맞는 쿠폰을 월 단위로 동기화함
 * unique index와 upsert를 함께 사용해서 중복 요청에도 한 번만 발급함
 */
export async function syncEligibleCouponsForUser(userId: string) {
  const user = await UserModel.findById(userId)
    .select("current_plan_id")
    .lean();

  if (!user) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  if (!user.current_plan_id) {
    return;
  }

  const plan = await PlanModel.findById(user.current_plan_id)
    .select("code monthlyFee membershipTier")
    .lean();

  if (!plan) {
    return;
  }

  const now = new Date();
  const benefits = await BenefitModel.find({
    isActive: true,
    benefitType: "coupon",
    $and: [
      {
        $or: [
          { "period.startsAt": null },
          { "period.startsAt": { $lte: now } },
        ],
      },
      {
        $or: [{ "period.endsAt": null }, { "period.endsAt": { $gte: now } }],
      },
      {
        $or: [
          { recommendedPlanCodes: { $size: 0 } },
          { recommendedPlanCodes: plan.code },
        ],
      },
      {
        $or: [
          { minPlanMonthlyFee: null },
          { minPlanMonthlyFee: { $lte: plan.monthlyFee } },
        ],
      },
    ],
  }).lean();

  const eligibleBenefits = benefits.filter((benefit) =>
    meetsMembershipTier(plan.membershipTier, benefit.minMembershipTier),
  );

  if (eligibleBenefits.length === 0) {
    return;
  }

  const issuanceKey = getIssuanceKey(now);
  const endOfMonth = getEndOfMonth(now);

  await UserCouponModel.bulkWrite(
    eligibleBenefits.map((benefit) => ({
      updateOne: {
        filter: {
          user_id: user._id,
          benefit_id: benefit._id,
          issuance_key: issuanceKey,
        },
        update: {
          $setOnInsert: {
            status: "available",
            coupon_number: createCouponNumber(),
            barcode_value: createBarcodeValue(),
            issued_at: now,
            expires_at: benefit.period.endsAt ?? endOfMonth,
            used_at: null,
          },
        },
        upsert: true,
      },
    })),
  );
}

async function ensureCouponCredentialsForUser(userId: string) {
  // 기존 발급 데이터에도 번호와 바코드를 채워 스키마 변경 전 쿠폰을 계속 사용할 수 있게 함
  const couponsWithoutCredentials = await UserCouponModel.find({
    user_id: userId,
    $or: [
      { coupon_number: { $exists: false } },
      { barcode_value: { $exists: false } },
    ],
  })
    .select("_id")
    .lean();

  if (couponsWithoutCredentials.length > 0) {
    await UserCouponModel.bulkWrite(
      couponsWithoutCredentials.map((coupon) => ({
        updateOne: {
          filter: { _id: coupon._id },
          update: {
            $set: {
              coupon_number: createCouponNumber(),
              barcode_value: createBarcodeValue(),
            },
          },
        },
      })),
    );
  }
}

function getCouponStatus(
  status: "available" | "used" | "revoked",
  expiresAt: Date,
  now: Date,
) {
  if (status === "used") {
    return "used" as const;
  }

  if (status === "revoked") {
    return "revoked" as const;
  }

  return expiresAt <= now ? ("expired" as const) : ("available" as const);
}

export async function getMyCoupons(userId: string, filter: CouponFilter) {
  await syncEligibleCouponsForUser(userId);
  await ensureCouponCredentialsForUser(userId);

  const now = new Date();
  const expiringAt = new Date(
    now.getTime() + EXPIRING_DAYS * 24 * 60 * 60 * 1000,
  );
  const couponDocuments = await UserCouponModel.find({
    user_id: userId,
    status: { $ne: "revoked" },
  })
    .sort({ expires_at: 1, issued_at: -1 })
    .lean();

  const benefitIds = couponDocuments.map((coupon) => coupon.benefit_id);
  const benefits = await BenefitModel.find({ _id: { $in: benefitIds } }).lean();
  const benefitMap = new Map(
    benefits.map((benefit) => [benefit._id.toString(), benefit]),
  );

  const coupons = couponDocuments.flatMap((coupon) => {
    const benefit = benefitMap.get(coupon.benefit_id.toString());

    if (!benefit) {
      return [];
    }

    const status = getCouponStatus(coupon.status, coupon.expires_at, now);
    const expiringSoon =
      status === "available" && coupon.expires_at <= expiringAt;

    return [
      {
        id: coupon._id.toString(),
        benefitCode: benefit.code,
        title: benefit.title,
        partner: benefit.partner,
        brand: benefit.brand,
        summary: benefit.summary,
        value: benefit.value,
        couponNumber: coupon.coupon_number,
        barcodeValue: coupon.barcode_value,
        barcodeType: "CODE128" as const,
        status,
        expiringSoon,
        issuedAt: coupon.issued_at,
        expiresAt: coupon.expires_at,
        usedAt: coupon.used_at,
      },
    ];
  });

  const summary = coupons.reduce(
    (counts, coupon) => {
      if (coupon.status === "available") {
        counts.available += 1;
        if (coupon.expiringSoon) {
          counts.expiring += 1;
        }
      } else if (coupon.status === "used") {
        counts.used += 1;
      } else if (coupon.status === "expired") {
        counts.expired += 1;
      }

      return counts;
    },
    { available: 0, expiring: 0, used: 0, expired: 0 },
  );

  const filteredCoupons = coupons.filter((coupon) => {
    if (filter === "all") {
      return true;
    }
    if (filter === "expiring") {
      return coupon.expiringSoon;
    }
    return coupon.status === filter;
  });

  return { summary, coupons: filteredCoupons };
}

export async function useMyCoupon(userId: string, couponId: string) {
  if (!isValidObjectId(couponId)) {
    throw new AppError(400, "잘못된 쿠폰 ID예요.");
  }

  const now = new Date();
  // 상태와 만료 시각을 갱신 조건에 포함해 동시 사용 요청도 한 번만 성공시킴
  const coupon = await UserCouponModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(couponId),
      user_id: userId,
      status: "available",
      expires_at: { $gt: now },
    },
    { $set: { status: "used", used_at: now } },
    { new: true },
  );

  if (!coupon) {
    const existingCoupon = await UserCouponModel.findOne({
      _id: new Types.ObjectId(couponId),
      user_id: userId,
    })
      .select("status expires_at")
      .lean();

    if (!existingCoupon) {
      throw new AppError(404, "쿠폰을 찾을 수 없어요.");
    }

    if (existingCoupon.status === "used") {
      throw new AppError(409, "이미 사용한 쿠폰이에요.");
    }

    if (existingCoupon.expires_at <= now) {
      throw new AppError(409, "사용 기간이 만료된 쿠폰이에요.");
    }

    throw new AppError(409, "사용할 수 없는 쿠폰이에요.");
  }

  const benefit = await BenefitModel.findById(coupon.benefit_id).lean();

  return {
    id: coupon._id.toString(),
    benefitCode: benefit?.code ?? null,
    couponNumber: coupon.coupon_number,
    status: "used" as const,
    usedAt: coupon.used_at,
  };
}

export async function revokeAvailableCouponsForUser(userId: string) {
  await UserCouponModel.updateMany(
    { user_id: userId, status: "available" },
    { $set: { status: "revoked" } },
  );
}
