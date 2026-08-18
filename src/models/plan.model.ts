import { Schema, model } from "mongoose";

export type PlanNetwork = "5G" | "LTE" | "5G/LTE";
export type PlanCategory = "mobile" | "tablet" | "premium" | "legacy";
export type PlanProductLine = "nerget" | "uplus";

export interface IDataAllowance {
    display: string;
    amountMb: number | null;
    throttleKbps: number | null;
    sharingDisplay: string | null;
}

export interface IPlan {
    code: string;
    carrier: "LG_U_PLUS";
    productLine: PlanProductLine;
    name: string;
    category: PlanCategory;
    network: PlanNetwork;
    audiences: string[];
    monthlyFee: number;
    discountFee: number | null;
    data: IDataAllowance;
    voice: string;
    sms: string;
    membershipTier: string | null;
    perks: string[];
    tags: string[];
    recommendationTags: string[];
    sourceUrl: string;
    sourceCheckedAt: Date;
    isActive: boolean;
    sortOrder: number;
    created_at?: Date;
    updated_at?: Date;
}

const dataAllowanceSchema = new Schema<IDataAllowance>(
    {
        display: { type: String, required: true },
        amountMb: { type: Number, default: null },
        throttleKbps: { type: Number, default: null },
        sharingDisplay: { type: String, default: null },
    },
    { _id: false },
);

const planSchema = new Schema<IPlan>(
    {
        code: { type: String, required: true },
        carrier: {
            type: String,
            required: true,
            enum: ["LG_U_PLUS"],
            default: "LG_U_PLUS",
        },
        productLine: {
            type: String,
            required: true,
            enum: ["nerget", "uplus"],
            default: "uplus",
        },
        name: { type: String, required: true },
        category: {
            type: String,
            required: true,
            enum: ["mobile", "tablet", "premium", "legacy"],
        },
        network: {
            type: String,
            required: true,
            enum: ["5G", "LTE", "5G/LTE"],
        },
        audiences: { type: [String], required: true, default: ["general"] },
        monthlyFee: { type: Number, required: true },
        discountFee: { type: Number, default: null },
        data: { type: dataAllowanceSchema, required: true },
        voice: { type: String, required: true },
        sms: { type: String, required: true },
        membershipTier: { type: String, default: null },
        perks: { type: [String], default: [] },
        tags: { type: [String], default: [] },
        recommendationTags: { type: [String], default: [] },
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

// 요금제 코드는 seed 재실행 시 같은 문서를 갱신하기 위한 기준임
planSchema.index({ carrier: 1, code: 1 }, { unique: true });
planSchema.index({ productLine: 1, isActive: 1, monthlyFee: 1 });
planSchema.index({ category: 1, monthlyFee: 1 });
planSchema.index({ tags: 1 });
planSchema.index({ recommendationTags: 1 });

export const PlanModel = model<IPlan>("Plan", planSchema);
