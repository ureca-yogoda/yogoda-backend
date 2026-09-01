import { model, Schema, Types } from "mongoose";

export type SubscriptionCategory =
  "ott" | "music" | "shopping" | "delivery" | "other";
export type SubscriptionStatus = "active" | "canceled";

export interface IUserSubscription {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  service_code: string;
  service_name: string;
  category: SubscriptionCategory;
  monthly_fee: number;
  status: SubscriptionStatus;
  started_at: Date;
  canceled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const userSubscriptionSchema = new Schema<IUserSubscription>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    service_code: { type: String, required: true, trim: true },
    service_name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["ott", "music", "shopping", "delivery", "other"],
      required: true,
    },
    monthly_fee: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["active", "canceled"],
      default: "active",
      required: true,
    },
    started_at: { type: Date, required: true },
    canceled_at: { type: Date, default: null },
  },
  {
    collection: "user_subscriptions",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

userSubscriptionSchema.index({ user_id: 1, service_code: 1 }, { unique: true });
userSubscriptionSchema.index({ user_id: 1, status: 1, updated_at: -1 });

export const UserSubscriptionModel = model<IUserSubscription>(
  "UserSubscription",
  userSubscriptionSchema,
);
