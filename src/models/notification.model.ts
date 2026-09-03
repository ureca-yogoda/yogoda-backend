import { Schema, model, Types } from "mongoose";

/*
 * 알림 종류. 새 알림 트리거를 추가할 때마다 여기에 타입을 늘려감.
 * (요금제 추천 알림은 아직 매칭 로직이 없어 추후 추가 예정)
 */
export type NotificationType =
  | "coupon_expiring"
  | "attendance_reminder"
  | "consultation_incomplete"
  | "usage_pattern_changed";

export interface INotification {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  // 알림을 탭했을 때 이동할 프론트 경로 (예: "/my/coupons")
  link: string | null;
  // 같은 알림을 중복 생성하지 않기 위한 조합 키 (예: "coupon_expiring:{couponId}")
  dedupe_key: string;
  read_at: Date | null;
  created_at: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "coupon_expiring",
        "attendance_reminder",
        "consultation_incomplete",
        "usage_pattern_changed",
      ],
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String, default: null },
    dedupe_key: { type: String, required: true },
    read_at: { type: Date, default: null },
  },
  {
    collection: "notifications",
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  },
);

// 유저별 알림 목록을 최신순으로 조회할 때 사용
notificationSchema.index({ user_id: 1, created_at: -1 });
// 안 읽은 알림 개수 카운트에 사용
notificationSchema.index({ user_id: 1, read_at: 1 });
// 같은 알림(예: 같은 쿠폰의 만료 임박)을 중복 생성하지 않도록 함
notificationSchema.index({ user_id: 1, dedupe_key: 1 }, { unique: true });

export const NotificationModel = model<INotification>(
  "Notification",
  notificationSchema,
);
