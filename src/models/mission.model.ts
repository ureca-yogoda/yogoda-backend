import { Schema, model } from "mongoose";

export type MissionCategory =
  | "attendance"
  | "quiz"
  | "event"
  | "subscription"
  | "profile"
  | "referral";

export type MissionStatus = "active" | "scheduled" | "ended";

export interface IMissionPeriod {
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface IMission {
  code: string;
  title: string;
  category: MissionCategory;
  summary: string;
  requirement: string;
  reward: string;
  period: IMissionPeriod;
  status: MissionStatus;
  tags: string[];
  targetUserTags: string[];
  recommendationWeight: number;
  sourceUrl: string;
  sourceCheckedAt: Date;
  isActive: boolean;
  sortOrder: number;
  created_at?: Date;
  updated_at?: Date;
}

const missionPeriodSchema = new Schema<IMissionPeriod>(
  {
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { _id: false },
);

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
    reward: { type: String, required: true },
    period: { type: missionPeriodSchema, required: true },
    status: {
      type: String,
      required: true,
      enum: ["active", "scheduled", "ended"],
      default: "active",
    },
    tags: { type: [String], default: [] },
    targetUserTags: { type: [String], default: [] },
    recommendationWeight: { type: Number, required: true, default: 0 },
    sourceUrl: { type: String, required: true },
    sourceCheckedAt: { type: Date, required: true },
    isActive: { type: Boolean, required: true, default: true },
    sortOrder: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 미션 코드는 이벤트성 데이터가 갱신되어도 같은 항목을 찾아 덮어쓰기 위한 키임
missionSchema.index({ status: 1, sortOrder: 1 });
missionSchema.index({ category: 1, status: 1 });
missionSchema.index({ tags: 1 });
missionSchema.index({ targetUserTags: 1 });

export const MissionModel = model<IMission>("Mission", missionSchema);
