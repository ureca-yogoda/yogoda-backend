import { model, Schema, Types } from "mongoose";

export interface IUserUsageSummary {
  user_id: Types.ObjectId;
  plan_id: Types.ObjectId;
  usage_month: string;
  data_usage_gb: number;
  call_minutes: number;
  tethering_usage_gb: number;
  actual_bill_amount: number;
  created_at?: Date;
  updated_at?: Date;
}

const userUsageSummarySchema = new Schema<IUserUsageSummary>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    plan_id: {
      type: Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    usage_month: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    data_usage_gb: { type: Number, required: true, min: 0, default: 0 },
    call_minutes: { type: Number, required: true, min: 0, default: 0 },
    tethering_usage_gb: { type: Number, required: true, min: 0, default: 0 },
    actual_bill_amount: { type: Number, required: true, min: 0 },
  },
  {
    collection: "user_usage_summaries",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 같은 사용자의 월별 사용량 요약이 중복 생성되지 않도록 제한함
userUsageSummarySchema.index({ user_id: 1, usage_month: 1 }, { unique: true });
userUsageSummarySchema.index({ plan_id: 1, usage_month: 1 });

export const UserUsageSummaryModel = model<IUserUsageSummary>(
  "UserUsageSummary",
  userUsageSummarySchema,
);
