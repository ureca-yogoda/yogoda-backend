import { Schema, model, type Types } from "mongoose";

export type BenefitCategory =
  | "membership"
  | "partner"
  | "discount"
  | "event"
  | "subscription"
  | "device"
  | "content"
  | "safety"
  | "payment"
  | "family"
  | "lifestyle";

export type BenefitType =
  | "coupon"
  | "discount"
  | "bundle"
  | "subscription"
  | "insurance"
  | "reward"
  | "data"
  | "device";

export interface IBenefit {
  code: string;
  title: string;
  category: BenefitCategory;
  benefit_type: BenefitType;
  partner: string | null;
  brand_id?: Types.ObjectId | null;
  brand: string | null;
  summary: string;
  eligibility: string;
  value: string;
  usage_limit: string | null;
  minMembershipTier: string | null;
  min_membership_tier_id?: Types.ObjectId | null;
  min_plan_monthly_fee: number | null;
  recommended_plan_codes: string[];
  target_user_tags: string[];
  recommendation_weight: number;
  start_date: Date | null;
  end_date: Date | null;
  tags: string[];
  source_url: string;
  source_checked_at: Date;
  is_active: boolean;
  sort_order: number;
  calendar_day?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

const benefitSchema = new Schema<IBenefit>(
  {
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: [
        "membership",
        "partner",
        "discount",
        "event",
        "subscription",
        "device",
        "content",
        "safety",
        "payment",
        "family",
        "lifestyle",
      ],
    },
    benefit_type: {
      type: String,
      required: true,
      enum: [
        "coupon",
        "discount",
        "bundle",
        "subscription",
        "insurance",
        "reward",
        "data",
        "device",
      ],
      default: "coupon",
    },
    partner: { type: String, default: null },
    brand_id: {
      type: Schema.Types.ObjectId,
      ref: "PartnerBrand",
      default: null,
    },
    // 기존 문자열 브랜드 데이터 이관이 끝날 때까지만 호환용으로 유지함
    brand: { type: String, default: null },
    summary: { type: String, required: true },
    eligibility: { type: String, required: true },
    value: { type: String, required: true },
    usage_limit: { type: String, default: null },
    minMembershipTier: { type: String, default: null },
    min_membership_tier_id: {
      type: Schema.Types.ObjectId,
      ref: "MembershipTier",
      default: null,
    },
    min_plan_monthly_fee: { type: Number, default: null },
    recommended_plan_codes: { type: [String], default: [] },
    target_user_tags: { type: [String], default: [] },
    recommendation_weight: { type: Number, required: true, default: 0 },
    start_date: { type: Date, default: null },
    end_date: { type: Date, default: null },
    tags: { type: [String], default: [] },
    source_url: { type: String, required: true },
    source_checked_at: { type: Date, required: true },
    is_active: { type: Boolean, required: true, default: true },
    sort_order: { type: Number, required: true, default: 0 },
    calendar_day: { type: Number, min: 1, max: 31, default: null },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 혜택 코드는 운영 데이터 갱신 시 중복 생성을 막기 위한 식별자임
benefitSchema.index({ category: 1, sort_order: 1 });
benefitSchema.index({ tags: 1 });
benefitSchema.index({ brand: 1 });
benefitSchema.index({ brand_id: 1 });
benefitSchema.index({ target_user_tags: 1 });
benefitSchema.index({ recommended_plan_codes: 1 });

export const BenefitModel = model<IBenefit>("Benefit", benefitSchema);
