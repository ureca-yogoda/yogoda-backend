import { model, Schema } from "mongoose";

export type StoreService =
  "mobile" | "internet" | "payment" | "support" | "data_transfer";

export interface IStore {
  code: string;
  name: string;
  region: string;
  district: string;
  address: string;
  phone: string | null;
  weekdayHours: string;
  saturdayHours: string | null;
  sundayHours: string | null;
  services: StoreService[];
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  isDirect: boolean;
  isActive: boolean;
  sourceUrl: string;
}

const storeSchema = new Schema<IStore>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    region: { type: String, required: true, trim: true, index: true },
    district: { type: String, required: true, trim: true, index: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, default: null },
    weekdayHours: { type: String, required: true },
    saturdayHours: { type: String, default: null },
    sundayHours: { type: String, default: null },
    services: {
      type: [String],
      enum: ["mobile", "internet", "payment", "support", "data_transfer"],
      default: [],
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (coordinates: number[]) => coordinates.length === 2,
          message: "매장 좌표는 경도와 위도 순서로 입력해야 함",
        },
      },
    },
    isDirect: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sourceUrl: { type: String, required: true },
  },
  {
    collection: "stores",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

storeSchema.index({ location: "2dsphere" });
storeSchema.index({ name: "text", address: "text" });

export const StoreModel = model<IStore>("Store", storeSchema);
