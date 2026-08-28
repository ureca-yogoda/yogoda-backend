import { Schema, model, type Types } from "mongoose";

export interface IAttendanceRecord {
  user_id: Types.ObjectId;
  attendance_date: string;
  reward_points: number;
  created_at?: Date;
}

const attendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    attendance_date: { type: String, required: true },
    reward_points: { type: Number, required: true, default: 30 },
  },
  {
    collection: "attendance_records",
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  },
);

// 서버 재시도와 동시 요청에도 하루 한 번만 출석되도록 보장함
attendanceRecordSchema.index(
  { user_id: 1, attendance_date: 1 },
  { unique: true },
);

export const AttendanceRecordModel = model<IAttendanceRecord>(
  "AttendanceRecord",
  attendanceRecordSchema,
);
