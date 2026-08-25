import { Schema, model, type Types } from "mongoose";

export interface ISavedBenefit {
  user_id: Types.ObjectId;
  benefit_id: Types.ObjectId;
  created_at?: Date;
}

const savedBenefitSchema = new Schema<ISavedBenefit>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    benefit_id: { type: Schema.Types.ObjectId, ref: "Benefit", required: true },
  },
  {
    collection: "saved_benefits",
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  },
);

savedBenefitSchema.index({ user_id: 1, benefit_id: 1 }, { unique: true });

export const SavedBenefitModel = model<ISavedBenefit>(
  "SavedBenefit",
  savedBenefitSchema,
);
