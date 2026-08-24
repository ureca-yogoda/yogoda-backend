import { BenefitModel, type IBenefit } from "../models/benefit.model.js";
import { PlanModel } from "../models/plan.model.js";
import { SavedBenefitModel } from "../models/saved-benefit.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/AppError.js";
import {
  evaluateBenefitEligibility,
  type UserPlanCondition,
} from "./benefit-eligibility.js";

export type BenefitFilter = "all" | "membership" | "partner" | "discount";

async function getUserPlan(userId: string): Promise<UserPlanCondition | null> {
  const user = await UserModel.findById(userId)
    .select("current_plan_id")
    .lean();

  if (!user) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  if (!user.current_plan_id) {
    return null;
  }

  return PlanModel.findById(user.current_plan_id)
    .select("code monthlyFee membershipTier")
    .lean();
}

function serializeBenefit(
  benefit: IBenefit & { _id: unknown },
  plan: UserPlanCondition | null,
  saved = false,
) {
  return {
    id: String(benefit._id),
    code: benefit.code,
    title: benefit.title,
    category: benefit.category,
    benefitType: benefit.benefitType,
    partner: benefit.partner,
    brand: benefit.brand,
    summary: benefit.summary,
    eligibility: benefit.eligibility,
    value: benefit.value,
    usageLimit: benefit.usageLimit,
    minMembershipTier: benefit.minMembershipTier,
    period: benefit.period,
    tags: benefit.tags,
    saved,
    ...evaluateBenefitEligibility(benefit, plan),
  };
}

export async function getBenefits(userId: string, filter: BenefitFilter) {
  const [plan, benefits, savedBenefits] = await Promise.all([
    getUserPlan(userId),
    BenefitModel.find({
      isActive: true,
      ...(filter !== "all" && { category: filter }),
      $and: [
        {
          $or: [
            { "period.startsAt": null },
            { "period.startsAt": { $lte: new Date() } },
          ],
        },
        {
          $or: [
            { "period.endsAt": null },
            { "period.endsAt": { $gte: new Date() } },
          ],
        },
      ],
    })
      .sort({ recommendationWeight: -1, sortOrder: 1 })
      .lean(),
    SavedBenefitModel.find({ user_id: userId }).select("benefit_id").lean(),
  ]);

  const savedIds = new Set(
    savedBenefits.map((item) => item.benefit_id.toString()),
  );
  const items = benefits.map((benefit) =>
    serializeBenefit(benefit, plan, savedIds.has(benefit._id.toString())),
  );

  return {
    currentMembershipTier: plan?.membershipTier ?? null,
    eligibleCount: items.filter((benefit) => benefit.eligible).length,
    benefits: items,
  };
}

export async function getBenefit(userId: string, code: string) {
  const [plan, benefit] = await Promise.all([
    getUserPlan(userId),
    BenefitModel.findOne({ code, isActive: true }).lean(),
  ]);

  if (!benefit) {
    throw new AppError(404, "혜택을 찾을 수 없어요.");
  }

  const saved = await SavedBenefitModel.exists({
    user_id: userId,
    benefit_id: benefit._id,
  });
  return serializeBenefit(benefit, plan, Boolean(saved));
}

export async function saveBenefit(userId: string, code: string) {
  const benefit = await BenefitModel.findOne({ code, isActive: true }).select(
    "_id",
  );
  if (!benefit) throw new AppError(404, "혜택을 찾을 수 없어요.");
  await SavedBenefitModel.updateOne(
    { user_id: userId, benefit_id: benefit._id },
    { $setOnInsert: { user_id: userId, benefit_id: benefit._id } },
    { upsert: true },
  );
  return { code, saved: true };
}

export async function removeSavedBenefit(userId: string, code: string) {
  const benefit = await BenefitModel.findOne({ code }).select("_id");
  if (!benefit) throw new AppError(404, "혜택을 찾을 수 없어요.");
  await SavedBenefitModel.deleteOne({
    user_id: userId,
    benefit_id: benefit._id,
  });
  return { code, saved: false };
}

export async function getSavedBenefits(userId: string) {
  const saved = await SavedBenefitModel.find({ user_id: userId })
    .sort({ created_at: -1 })
    .lean();
  const [plan, benefits] = await Promise.all([
    getUserPlan(userId),
    BenefitModel.find({
      _id: { $in: saved.map((item) => item.benefit_id) },
      isActive: true,
    }).lean(),
  ]);
  const benefitMap = new Map(
    benefits.map((benefit) => [benefit._id.toString(), benefit]),
  );
  return {
    benefits: saved.flatMap((item) => {
      const benefit = benefitMap.get(item.benefit_id.toString());
      return benefit ? [serializeBenefit(benefit, plan, true)] : [];
    }),
  };
}
