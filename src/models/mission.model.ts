import { Schema, model } from "mongoose";

export type MissionCategory =
  "attendance" | "quiz" | "event" | "subscription" | "profile" | "referral";

export type MissionStatus = "active" | "scheduled" | "ended";

export interface IMission {
  code: string;
  title: string;
  category: MissionCategory;
  summary: string;
  requirement: string;
  target_count: number;
  reward_points: number;
  start_date: Date | null;
  end_date: Date | null;
  status: MissionStatus;
  tags: string[];
  target_user_tags: string[];
  recommendation_weight: number;
  source_url: string;
  source_checked_at: Date;
  is_active: boolean;
  sort_order: number;
  created_at?: Date;
  updated_at?: Date;
}

const missionSchema = new Schema<IMission>(
  {
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: [
        "attendance",
        "quiz",
        "event",
        "subscription",
        "profile",
        "referral",
      ],
    },
    summary: { type: String, required: true },
    requirement: { type: String, required: true },
    target_count: { type: Number, required: true, min: 1, default: 1 },
    reward_points: { type: Number, required: true, min: 0 },
    start_date: { type: Date, default: null },
    end_date: { type: Date, default: null },
    status: {
      type: String,
      required: true,
      enum: ["active", "scheduled", "ended"],
      default: "active",
    },
    tags: { type: [String], default: [] },
    target_user_tags: { type: [String], default: [] },
    recommendation_weight: { type: Number, required: true, default: 0 },
    source_url: { type: String, required: true },
    source_checked_at: { type: Date, required: true },
    is_active: { type: Boolean, required: true, default: true },
    sort_order: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 미션 코드는 이벤트성 데이터가 갱신되어도 같은 항목을 찾아 덮어쓰기 위한 키임
missionSchema.index({ status: 1, sort_order: 1 });
missionSchema.index({ category: 1, status: 1 });
missionSchema.index({ tags: 1 });
missionSchema.index({ target_user_tags: 1 });

export const MissionModel = model<IMission>("Mission", missionSchema);
