import { Schema, model, Types } from "mongoose";

export type Provider = "kakao" | "google" | "naver";
export type Theme = "light" | "dark";

export interface IUser {
    _id: Types.ObjectId;
    nickname: string;
    provider: Provider;
    provider_id: string;
    refresh_token: string | null;
    current_plan_id: Types.ObjectId | null;
    user_patterns: Record<string, unknown> | null;
    role: string;
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
        user_patterns: { type: Schema.Types.Mixed, default: null },
        role: { type: String, required: true, default: "user" },
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
