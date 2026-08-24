import { Schema, model } from "mongoose";

export type PlanNetwork = "5G" | "LTE" | "5G/LTE";
export type PlanCategory = "mobile" | "tablet" | "premium" | "legacy";
export type PlanProductLine = "nerget" | "uplus";

export type PlanBenefitCategory =
  "content" | "payment" | "membership" | "device" | "bundle" | "other";

export type PlanChoiceBenefitStepType = "choice" | "info";

export type PlanChoiceBenefitSection =
  "plus" | "premium" | "detail" | "coupon" | "membership" | "addon" | "other";

export type PlanChoiceBenefitDependencyMatch = "any" | "all";

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

  brand: string | null;
  imageUrl: string | null;

  monthlyValue: number | null;
}

export interface IPlanChoiceBenefitDependency {
  stepCode: string;
  optionCodes: string[];
  match: PlanChoiceBenefitDependencyMatch;
}

export interface IPlanChoiceBenefit {
  code: string;

  stepType: PlanChoiceBenefitStepType;
  section: PlanChoiceBenefitSection;

  sectionTitle: string | null;
  title: string;
  instruction: string | null;

  selectionCount: number;
  required: boolean;
  sortOrder: number;

  dependsOn: IPlanChoiceBenefitDependency[];

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
    brand: {
      type: String,
      default: null,
    },
    imageUrl: {
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

const planChoiceBenefitDependencySchema =
  new Schema<IPlanChoiceBenefitDependency>(
    {
      stepCode: {
        type: String,
        required: true,
      },
      optionCodes: {
        type: [String],
        required: true,
        default: [],
      },
      match: {
        type: String,
        required: true,
        enum: ["any", "all"],
        default: "any",
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

    stepType: {
      type: String,
      required: true,
      enum: ["choice", "info"],
      default: "choice",
    },

    section: {
      type: String,
      required: true,
      enum: [
        "plus",
        "premium",
        "detail",
        "coupon",
        "membership",
        "addon",
        "other",
      ],
      default: "other",
    },

    sectionTitle: {
      type: String,
      default: null,
    },

    title: {
      type: String,
      required: true,
    },

    instruction: {
      type: String,
      default: null,
    },

    /*
     * choice 단계는 1개 이상,
     * info 단계는 선택할 것이 없으므로 0으로 사용할 수 있음
     */
    selectionCount: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
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

    /*
     * 특정 이전 선택에 따라 단계 노출 여부 결정
     * 비어 있으면 항상 노출 가능한 단계
     */
    dependsOn: {
      type: [planChoiceBenefitDependencySchema],
      default: [],
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
