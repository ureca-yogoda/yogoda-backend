import { Schema, model, type Types } from "mongoose";

export interface IPointProduct {
  code: string;
  benefit_id: Types.ObjectId;
  exchange_points: number;
  validity_days: number;
  stock: number | null;
  is_active: boolean;
  sort_order: number;
  created_at?: Date;
  updated_at?: Date;
}

const pointProductSchema = new Schema<IPointProduct>(
  {
    code: { type: String, required: true, unique: true },
    benefit_id: {
      type: Schema.Types.ObjectId,
      ref: "Benefit",
      required: true,
    },
    exchange_points: { type: Number, required: true, min: 1 },
    validity_days: { type: Number, required: true, min: 1, default: 30 },
    stock: { type: Number, min: 0, default: null },
    is_active: { type: Boolean, required: true, default: true },
    sort_order: { type: Number, required: true, default: 0 },
  },
  {
    collection: "point_products",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

pointProductSchema.index({ is_active: 1, sort_order: 1 });

export const PointProductModel = model<IPointProduct>(
  "PointProduct",
  pointProductSchema,
);
