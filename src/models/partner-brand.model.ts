import { model, Schema } from "mongoose";

export interface IPartnerBrand {
  code: string;
  name: string;
  category: string;
  logo_url: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: Date;
  updated_at?: Date;
}

const partnerBrandSchema = new Schema<IPartnerBrand>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, index: true },
    logo_url: { type: String, default: null },
    description: { type: String, default: null },
    is_active: { type: Boolean, required: true, default: true, index: true },
    sort_order: { type: Number, required: true, default: 0 },
  },
  {
    collection: "partner_brands",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

partnerBrandSchema.index({ is_active: 1, sort_order: 1 });

export const PartnerBrandModel = model<IPartnerBrand>(
  "PartnerBrand",
  partnerBrandSchema,
);
