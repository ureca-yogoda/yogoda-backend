import { Schema, model, Types } from "mongoose";

export type Provider = "kakao" | "google" | "naver";
export type Theme = "light" | "dark";
export type UserRole = "user" | "admin";
export type SignupType = "신규가입" | "번호이동";
export type PaymentMethod =
  "계좌이체" | "신용카드" | "카카오페이" | "네이버페이" | "토스";

export interface IUser {
  _id: Types.ObjectId;
  nickname: string;
  provider: Provider;
  provider_id: string;
  refresh_token: string | null;

  current_plan_id: Types.ObjectId | null;
  current_plan_options: Record<string, string[]>;
  plan_joined_at: Date | null;

  previous_monthly_fee: number | null;

  signup_type: SignupType | null;
  payment_method: PaymentMethod | null;

  // 가입 플로우 본인인증 카드에서 수집한 개인정보 (본인 확인 목적)
  real_name: string | null;
  birth_date: string | null;
  phone_number: string | null;
  identity_verified_at: Date | null;

  user_patterns: Record<string, unknown> | null;
  role: UserRole;
  theme: Theme;
  created_at: Date;
  updated_at: Date;
}

const userSchema = new Schema<IUser>(
  {
    nickname: { type: String, required: true },
    provider: {
      type: String,
      required: true,
      enum: ["kakao", "google", "naver"],
    },
    provider_id: { type: String, required: true },
    refresh_token: { type: String, default: null },

    current_plan_id: {
      type: Schema.Types.ObjectId,
      ref: "Plan",
      default: null,
    },

    current_plan_options: {
      type: Schema.Types.Mixed,
      default: {},
    },

    plan_joined_at: {
      type: Date,
      default: null,
    },

    previous_monthly_fee: {
      type: Number,
      default: null,
    },

    signup_type: {
      type: String,
      enum: ["신규가입", "번호이동"],
      default: null,
    },

    payment_method: {
      type: String,
      enum: ["계좌이체", "신용카드", "카카오페이", "네이버페이", "토스"],
      default: null,
    },

    real_name: {
      type: String,
      default: null,
    },
    birth_date: {
      type: String,
      default: null,
    },
    phone_number: {
      type: String,
      default: null,
    },
    identity_verified_at: {
      type: Date,
      default: null,
    },

    user_patterns: {
      type: Schema.Types.Mixed,
      default: null,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      required: true,
      default: "user",
    },
    theme: {
      type: String,
      enum: ["light", "dark"],
      required: true,
      default: "light",
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// provider + provider_id 조합으로 로그인 시 유저를 조회하므로 인덱스 필요
userSchema.index({ provider: 1, provider_id: 1 }, { unique: true });

export const UserModel = model<IUser>("User", userSchema);
