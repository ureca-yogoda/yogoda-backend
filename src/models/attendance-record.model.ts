import { Schema, model, type Types } from "mongoose";

export interface IAttendanceRecord {
  user_id: Types.ObjectId;
  date_key: string;
  checked_at: Date;
  points: number;
  created_at?: Date;
}

const attendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date_key: { type: String, required: true },
    checked_at: { type: Date, required: true, default: Date.now },
    points: { type: Number, required: true, default: 30 },
  },
  {
    collection: "attendance_records",
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  },
);

// 서버 재시도와 동시 요청에도 하루 한 번만 출석되도록 보장함
attendanceRecordSchema.index({ user_id: 1, date_key: 1 }, { unique: true });

export const AttendanceRecordModel = model<IAttendanceRecord>(
  "AttendanceRecord",
  attendanceRecordSchema,
);
