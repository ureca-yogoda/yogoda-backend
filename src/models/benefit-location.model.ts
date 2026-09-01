import { model, Schema, Types } from "mongoose";

export type BenefitLocationCategory = "food" | "culture" | "shopping";

export interface IBenefitLocation {
  benefit_id: Types.ObjectId;
  code: string;
  name: string;
  category: BenefitLocationCategory;
  address: string;
  phone: string | null;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  is_active: boolean;
}

const benefitLocationSchema = new Schema<IBenefitLocation>(
  {
    benefit_id: {
      type: Schema.Types.ObjectId,
      ref: "Benefit",
      required: true,
      index: true,
    },
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ["food", "culture", "shopping"],
      index: true,
    },
    address: { type: String, required: true, trim: true },
    phone: { type: String, default: null },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (coordinates: number[]) => coordinates.length === 2,
          message: "혜택 매장 좌표는 경도와 위도 순서로 입력해야 함",
        },
      },
    },
    is_active: { type: Boolean, default: true, index: true },
  },
  {
    collection: "benefit_locations",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

benefitLocationSchema.index({ location: "2dsphere" });
benefitLocationSchema.index({ name: "text", address: "text" });

export const BenefitLocationModel = model<IBenefitLocation>(
  "BenefitLocation",
  benefitLocationSchema,
);
