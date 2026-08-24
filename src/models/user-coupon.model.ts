import { model, Schema, Types } from "mongoose";

export type UserCouponStatus = "available" | "used" | "revoked";

export interface IUserCoupon {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  benefit_id: Types.ObjectId;
  issuance_key: string;
  coupon_number: string;
  barcode_value: string;
  status: UserCouponStatus;
  issued_at: Date;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const userCouponSchema = new Schema<IUserCoupon>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    benefit_id: {
      type: Schema.Types.ObjectId,
      ref: "Benefit",
      required: true,
    },
    issuance_key: { type: String, required: true },
    coupon_number: { type: String, required: true },
    barcode_value: { type: String, required: true },
    status: {
      type: String,
      enum: ["available", "used", "revoked"],
      default: "available",
      required: true,
    },
    issued_at: { type: Date, required: true },
    expires_at: { type: Date, required: true },
    used_at: { type: Date, default: null },
  },
  {
    collection: "user_coupons",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 같은 혜택은 월별 발급 키 기준으로 한 번만 생성함
userCouponSchema.index(
  { user_id: 1, benefit_id: 1, issuance_key: 1 },
  { unique: true },
);
userCouponSchema.index({ user_id: 1, status: 1, expires_at: 1 });
// 기존 쿠폰의 필드 보정 전에도 중복 없는 신규 번호를 발급할 수 있게 sparse로 구성함
userCouponSchema.index({ coupon_number: 1 }, { unique: true, sparse: true });
userCouponSchema.index({ barcode_value: 1 }, { unique: true, sparse: true });

export const UserCouponModel = model<IUserCoupon>(
  "UserCoupon",
  userCouponSchema,
);
