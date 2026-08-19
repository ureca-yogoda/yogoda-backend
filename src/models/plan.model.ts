import { Schema, model } from "mongoose";

export type PlanNetwork = "5G" | "LTE" | "5G/LTE";
export type PlanCategory = "mobile" | "tablet" | "premium" | "legacy";
export type PlanProductLine = "nerget" | "uplus";

export type PlanBenefitCategory =
  "content" | "payment" | "membership" | "device" | "bundle" | "other";

export interface IDataAllowance {
  display: string;
  amountMb: number | null;
  throttleKbps: number | null;
  sharingDisplay: string | null;
  familyDataDisplay: string | null;
}

export interface IPlanPromotion {
  badge: string | null;
  effectiveMonthlyFee: number | null;
  maxMonthlyBenefit: number | null;
}

export interface IPlanBenefitDetail {
  category: PlanBenefitCategory;
  title: string;
  description: string | null;
  monthlyValue: number | null;
}

export interface IPlanChoiceBenefitOption {
  code: string;
  title: string;
  description: string | null;
  monthlyValue: number | null;
}

export interface IPlanChoiceBenefit {
  code: string;
  title: string;
  selectionCount: number;
  required: boolean;
  sortOrder: number;
  options: IPlanChoiceBenefitOption[];
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
  additionalVoice: string | null;
  sms: string;

  membershipTier: string | null;
  smartDeviceBenefit: string | null;

  promotion: IPlanPromotion;
  benefitDetails: IPlanBenefitDetail[];
  choiceBenefits: IPlanChoiceBenefit[];

  isPopular: boolean;
  popularOrder: number | null;

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
    display: {
      type: String,
      required: true,
    },
    amountMb: {
      type: Number,
      default: null,
    },
    throttleKbps: {
      type: Number,
      default: null,
    },
    sharingDisplay: {
      type: String,
      default: null,
    },
    familyDataDisplay: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const planPromotionSchema = new Schema<IPlanPromotion>(
  {
    badge: {
      type: String,
      default: null,
    },
    effectiveMonthlyFee: {
      type: Number,
      default: null,
    },
    maxMonthlyBenefit: {
      type: Number,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const planBenefitDetailSchema = new Schema<IPlanBenefitDetail>(
  {
    category: {
      type: String,
      required: true,
      enum: ["content", "payment", "membership", "device", "bundle", "other"],
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    monthlyValue: {
      type: Number,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const planChoiceBenefitOptionSchema = new Schema<IPlanChoiceBenefitOption>(
  {
    code: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: null,
    },
    monthlyValue: {
      type: Number,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const planChoiceBenefitSchema = new Schema<IPlanChoiceBenefit>(
  {
    code: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    selectionCount: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    required: {
      type: Boolean,
      required: true,
      default: true,
    },
    sortOrder: {
      type: Number,
      required: true,
      default: 0,
    },
    options: {
      type: [planChoiceBenefitOptionSchema],
      default: [],
    },
  },
  {
    _id: false,
  },
);

const planSchema = new Schema<IPlan>(
  {
    code: {
      type: String,
      required: true,
    },

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

    name: {
      type: String,
      required: true,
    },

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

    audiences: {
      type: [String],
      required: true,
      default: ["general"],
    },

    monthlyFee: {
      type: Number,
      required: true,
    },

    discountFee: {
      type: Number,
      default: null,
    },

    data: {
      type: dataAllowanceSchema,
      required: true,
    },

    voice: {
      type: String,
      required: true,
    },

    additionalVoice: {
      type: String,
      default: null,
    },

    sms: {
      type: String,
      required: true,
    },

    membershipTier: {
      type: String,
      default: null,
    },

    smartDeviceBenefit: {
      type: String,
      default: null,
    },

    promotion: {
      type: planPromotionSchema,
      default: () => ({}),
    },

    benefitDetails: {
      type: [planBenefitDetailSchema],
      default: [],
    },

    choiceBenefits: {
      type: [planChoiceBenefitSchema],
      default: [],
    },

    isPopular: {
      type: Boolean,
      required: true,
      default: false,
    },

    popularOrder: {
      type: Number,
      default: null,
    },

    perks: {
      type: [String],
      default: [],
    },

    tags: {
      type: [String],
      default: [],
    },

    recommendationTags: {
      type: [String],
      default: [],
    },

    sourceUrl: {
      type: String,
      required: true,
    },

    sourceCheckedAt: {
      type: Date,
      required: true,
    },

    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },

    sortOrder: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    versionKey: false,
  },
);

// seed 재실행 시 동일 요금제를 갱신하기 위한 식별 기준
planSchema.index({ carrier: 1, code: 1 }, { unique: true });

planSchema.index({
  productLine: 1,
  isActive: 1,
  monthlyFee: 1,
});

planSchema.index({
  productLine: 1,
  isPopular: 1,
  popularOrder: 1,
});

planSchema.index({
  category: 1,
  monthlyFee: 1,
});

planSchema.index({ tags: 1 });
planSchema.index({ recommendationTags: 1 });

export const PlanModel = model<IPlan>("Plan", planSchema);
