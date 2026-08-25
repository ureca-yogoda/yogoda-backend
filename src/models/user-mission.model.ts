import { Schema, model, type Types } from "mongoose";

export type UserMissionStatus = "in_progress" | "completed" | "claimed";

export interface IUserMission {
  user_id: Types.ObjectId;
  mission_id: Types.ObjectId;
  status: UserMissionStatus;
  progress: number;
  joined_at: Date;
  completed_at: Date | null;
  claimed_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

const userMissionSchema = new Schema<IUserMission>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mission_id: { type: Schema.Types.ObjectId, ref: "Mission", required: true },
    status: {
      type: String,
      enum: ["in_progress", "completed", "claimed"],
      default: "in_progress",
      required: true,
    },
    progress: { type: Number, min: 0, max: 100, default: 0, required: true },
    joined_at: { type: Date, default: Date.now, required: true },
    completed_at: { type: Date, default: null },
    claimed_at: { type: Date, default: null },
  },
  {
    collection: "user_missions",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 같은 사용자가 같은 미션에 중복 참여 기록을 만들지 않도록 제한함
userMissionSchema.index({ user_id: 1, mission_id: 1 }, { unique: true });
userMissionSchema.index({ user_id: 1, status: 1 });

export const UserMissionModel = model<IUserMission>(
  "UserMission",
  userMissionSchema,
);
