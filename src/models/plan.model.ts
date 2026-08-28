import { Schema, model } from "mongoose";
import type { Types } from "mongoose";

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
  amount_mb: number | null;
  throttle_kbps: number | null;
  sharing_display: string | null;
  family_data_display: string | null;
}

export interface IPlanPromotion {
  badge: string | null;
  effective_monthly_fee: number | null;
  max_monthly_benefit: number | null;
}

export interface IPlanBenefitDetail {
  category: PlanBenefitCategory;
  title: string;
  description: string | null;
  monthly_value: number | null;
}

export interface IPlanChoiceBenefitOption {
  code: string;
  title: string;
  description: string | null;

  brand: string | null;
  image_url: string | null;

  monthly_value: number | null;
}

export interface IPlanChoiceBenefitDependency {
  step_code: string;
  option_codes: string[];
  match: PlanChoiceBenefitDependencyMatch;
}

export interface IPlanChoiceBenefit {
  code: string;

  step_type: PlanChoiceBenefitStepType;
  section: PlanChoiceBenefitSection;

  section_title: string | null;
  title: string;
  instruction: string | null;

  selection_count: number;
  required: boolean;
  sort_order: number;

  depends_on: IPlanChoiceBenefitDependency[];

  options: IPlanChoiceBenefitOption[];
}

export interface IPlan {
  code: string;
  carrier: "LG_U_PLUS";
  product_line: PlanProductLine;
  name: string;
  category: PlanCategory;
  network: PlanNetwork;
  audiences: string[];

  monthly_fee: number;
  discount_fee: number | null;

  data: IDataAllowance;

  voice: string;
  additional_voice: string | null;
  sms: string;

  membership_tier: string | null;
  membership_tier_id?: Types.ObjectId | null;
  smart_device_benefit: string | null;

  promotion: IPlanPromotion;
  benefit_details: IPlanBenefitDetail[];
  choice_benefits: IPlanChoiceBenefit[];

  is_popular: boolean;
  popular_order: number | null;

  perks: string[];
  tags: string[];
  recommendation_tags: string[];

  source_url: string;
  source_checked_at: Date;

  is_active: boolean;
  sort_order: number;

  created_at?: Date;
  updated_at?: Date;
}

const dataAllowanceSchema = new Schema<IDataAllowance>(
  {
    display: {
      type: String,
      required: true,
    },
    amount_mb: {
      type: Number,
      default: null,
    },
    throttle_kbps: {
      type: Number,
      default: null,
    },
    sharing_display: {
      type: String,
      default: null,
    },
    family_data_display: {
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
    effective_monthly_fee: {
      type: Number,
      default: null,
    },
    max_monthly_benefit: {
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
    monthly_value: {
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
    image_url: {
      type: String,
      default: null,
    },
    monthly_value: {
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
      step_code: {
        type: String,
        required: true,
      },
      option_codes: {
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

    step_type: {
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

    section_title: {
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
    selection_count: {
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

    sort_order: {
      type: Number,
      required: true,
      default: 0,
    },

    /*
     * 특정 이전 선택에 따라 단계 노출 여부 결정
     * 비어 있으면 항상 노출 가능한 단계
     */
    depends_on: {
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

    product_line: {
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

    monthly_fee: {
      type: Number,
      required: true,
    },

    discount_fee: {
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

    additional_voice: {
      type: String,
      default: null,
    },

    sms: {
      type: String,
      required: true,
    },

    membership_tier: {
      type: String,
      default: null,
    },
    membership_tier_id: {
      type: Schema.Types.ObjectId,
      ref: "MembershipTier",
      default: null,
    },

    smart_device_benefit: {
      type: String,
      default: null,
    },

    promotion: {
      type: planPromotionSchema,
      default: () => ({}),
    },

    benefit_details: {
      type: [planBenefitDetailSchema],
      default: [],
    },

    choice_benefits: {
      type: [planChoiceBenefitSchema],
      default: [],
    },

    is_popular: {
      type: Boolean,
      required: true,
      default: false,
    },

    popular_order: {
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

    recommendation_tags: {
      type: [String],
      default: [],
    },

    source_url: {
      type: String,
      required: true,
    },

    source_checked_at: {
      type: Date,
      required: true,
    },

    is_active: {
      type: Boolean,
      required: true,
      default: true,
    },

    sort_order: {
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
  product_line: 1,
  is_active: 1,
  monthly_fee: 1,
});

planSchema.index({
  product_line: 1,
  is_popular: 1,
  popular_order: 1,
});

planSchema.index({
  category: 1,
  monthly_fee: 1,
});

planSchema.index({ tags: 1 });
planSchema.index({ recommendation_tags: 1 });

export const PlanModel = model<IPlan>("Plan", planSchema);
