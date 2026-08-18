import { Schema, model } from "mongoose";

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

export interface IBenefitPeriod {
    startsAt: Date | null;
    endsAt: Date | null;
}

export interface IBenefit {
    code: string;
    title: string;
    category: BenefitCategory;
    benefitType: BenefitType;
    partner: string | null;
    brand: string | null;
    summary: string;
    eligibility: string;
    value: string;
    usageLimit: string | null;
    minMembershipTier: string | null;
    minPlanMonthlyFee: number | null;
    recommendedPlanCodes: string[];
    targetUserTags: string[];
    recommendationWeight: number;
    period: IBenefitPeriod;
    tags: string[];
    sourceUrl: string;
    sourceCheckedAt: Date;
    isActive: boolean;
    sortOrder: number;
    created_at?: Date;
    updated_at?: Date;
}

const benefitPeriodSchema = new Schema<IBenefitPeriod>(
    {
        startsAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },
    },
    { _id: false },
);

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
        benefitType: {
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
        brand: { type: String, default: null },
        summary: { type: String, required: true },
        eligibility: { type: String, required: true },
        value: { type: String, required: true },
        usageLimit: { type: String, default: null },
        minMembershipTier: { type: String, default: null },
        minPlanMonthlyFee: { type: Number, default: null },
        recommendedPlanCodes: { type: [String], default: [] },
        targetUserTags: { type: [String], default: [] },
        recommendationWeight: { type: Number, required: true, default: 0 },
        period: { type: benefitPeriodSchema, required: true },
        tags: { type: [String], default: [] },
        sourceUrl: { type: String, required: true },
        sourceCheckedAt: { type: Date, required: true },
        isActive: { type: Boolean, required: true, default: true },
        sortOrder: { type: Number, required: true, default: 0 },
    },
    {
        timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
        versionKey: false,
    },
);

// 혜택 코드는 운영 데이터 갱신 시 중복 생성을 막기 위한 식별자임
benefitSchema.index({ category: 1, sortOrder: 1 });
benefitSchema.index({ tags: 1 });
benefitSchema.index({ brand: 1 });
benefitSchema.index({ targetUserTags: 1 });
benefitSchema.index({ recommendedPlanCodes: 1 });

export const BenefitModel = model<IBenefit>("Benefit", benefitSchema);
