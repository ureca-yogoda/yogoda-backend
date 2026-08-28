import { model, Schema } from "mongoose";

export interface IMembershipTier {
  code: string;
  name: string;
  level: number;
  description: string | null;
  min_monthly_fee: number;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

const membershipTierSchema = new Schema<IMembershipTier>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    level: { type: Number, required: true, min: 0 },
    description: { type: String, default: null },
    min_monthly_fee: { type: Number, required: true, min: 0, default: 0 },
    is_active: { type: Boolean, required: true, default: true },
  },
  {
    collection: "membership_tiers",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

membershipTierSchema.index({ is_active: 1, level: 1 });

export const MembershipTierModel = model<IMembershipTier>(
  "MembershipTier",
  membershipTierSchema,
);
