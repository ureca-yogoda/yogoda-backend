import { UserCouponModel } from "../models/user-coupon.model.js";
import { UserModel } from "../models/user.model.js";
import { AttendanceRecordModel } from "../models/attendance-record.model.js";
import { ChatSessionModel } from "../models/chat-session.model.js";
import {
  NotificationModel,
  type NotificationType,
} from "../models/notification.model.js";
import { emitNotificationToUser } from "../api/websocket/notification.websocket.js";

// 만료 며칠 전에 알림을 보낼지
const COUPON_EXPIRING_SOON_DAYS = 3;
// AI 상담을 몇 시간 이상 방치하면 미완료로 보고 리마인드할지
const CONSULTATION_IDLE_HOURS = 3;

function getDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 알림을 DB에 저장하고, 대상 유저가 지금 접속 중이면 소켓으로 실시간 push합니다.
 * dedupe_key가 겹치면(이미 같은 알림을 보낸 적 있으면) 조용히 건너뜁니다.
 */
async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  dedupeKey: string;
}) {
  try {
    const notification = await NotificationModel.create({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      dedupe_key: input.dedupeKey,
    });

    emitNotificationToUser(input.userId, {
      id: notification._id.toString(),
      type: notification.type,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      createdAt: notification.created_at,
    });
  } catch (err) {
    // unique 인덱스(user_id + dedupe_key) 충돌이면 이미 보낸 알림이므로 정상적으로 무시함
    const isDuplicateKeyError =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 11000;

    if (!isDuplicateKeyError) throw err;
  }
}

/**
 * 만료 D-3인 보유 쿠폰을 스캔해 알림을 생성합니다.
 * 매일 한 번 cron으로 호출되며, 같은 쿠폰에 대해 두 번 이상 알림을 보내지 않도록
 * dedupe_key(coupon_expiring:{쿠폰id})로 중복을 막습니다.
 */
export async function notifyExpiringCoupons() {
  const now = new Date();
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + COUPON_EXPIRING_SOON_DAYS);

  // "D-3일 정각"이 아니라 "지금부터 D-3일 사이"에 만료되는 쿠폰을 대상으로 함
  // (cron이 매일 정해진 시각 한 번만 돌기 때문에, 정확히 그 순간의 쿠폰만 보면 놓치는 쿠폰이 생김)
  const expiringCoupons = await UserCouponModel.find({
    status: "available",
    expires_at: { $gte: now, $lte: targetDate },
  })
    .select("_id user_id expires_at")
    .lean();

  // 대상자가 많아질 수 있어, 서로 독립적인 알림 생성을 순차가 아닌 병렬로 처리함
  await Promise.all(
    expiringCoupons.map((coupon) => {
      const daysLeft = Math.max(
        0,
        Math.ceil(
          (coupon.expires_at.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );

      return createNotification({
        userId: coupon.user_id.toString(),
        type: "coupon_expiring",
        title: "쿠폰 만료가 임박했어요",
        body:
          daysLeft === 0
            ? "보유하신 쿠폰이 오늘 만료돼요."
            : `보유하신 쿠폰이 ${daysLeft}일 후 만료돼요.`,
        link: "/my/coupons",
        dedupeKey: `coupon_expiring:${coupon._id.toString()}`,
      });
    }),
  );

  return { checked: expiringCoupons.length };
}

/**
 * 오늘 아직 출석 체크를 하지 않은 유저에게 리마인드 알림을 보냅니다.
 * 매일 저녁 정해진 시각(예: 20시)에 한 번 cron으로 호출되며, dedupe_key에
 * 오늘 날짜(date_key)가 포함되어 있어 같은 날 두 번 이상 보내지 않습니다.
 */
export async function notifyAttendanceReminder() {
  const todayKey = getDateKey();

  const [allUserIds, checkedInRecords] = await Promise.all([
    UserModel.find().select("_id").lean(),
    AttendanceRecordModel.find({ date_key: todayKey }).select("user_id").lean(),
  ]);

  const checkedInUserIds = new Set(
    checkedInRecords.map((record) => record.user_id.toString()),
  );
  const notCheckedInUserIds = allUserIds
    .map((user) => user._id.toString())
    .filter((userId) => !checkedInUserIds.has(userId));

  // 전체 미출석 유저가 대상이라 순차 처리 시 느려질 수 있어 병렬로 처리함
  await Promise.all(
    notCheckedInUserIds.map((userId) =>
      createNotification({
        userId,
        type: "attendance_reminder",
        title: "오늘 출석 체크 잊지 않으셨나요?",
        body: "출석 체크하고 포인트 받아가세요!",
        link: "/mission",
        dedupeKey: `attendance_reminder:${userId}:${todayKey}`,
      }),
    ),
  );

  return { checked: notCheckedInUserIds.length };
}

/**
 * 일정 시간 이상 방치된(마지막 메시지 이후로 응답이 없는) 진행 중인 AI 상담 세션에
 * 리마인드 알림을 보냅니다. 짧은 주기(예: 30분마다)로 cron 호출되며, dedupe_key에
 * 세션 id가 포함되어 있어 같은 세션에 대해 두 번 이상 보내지 않습니다.
 */
export async function notifyIncompleteConsultations() {
  const idleBefore = new Date(
    Date.now() - CONSULTATION_IDLE_HOURS * 60 * 60 * 1000,
  );

  const idleSessions = await ChatSessionModel.find({
    ended_at: null,
    updated_at: { $lte: idleBefore },
    // 비회원 세션은 알림 보낼 계정이 없으므로 대상에서 제외함
    user_id: { $ne: null },
  })
    .select("_id user_id")
    .lean();

  await Promise.all(
    idleSessions.map((session) =>
      createNotification({
        userId: session.user_id!,
        type: "consultation_incomplete",
        title: "상담이 아직 끝나지 않았어요",
        body: "AI 상담을 이어서 진행하고 딱 맞는 요금제를 추천받아 보세요.",
        link: "/ai",
        dedupeKey: `consultation_incomplete:${session._id.toString()}`,
      }),
    ),
  );

  return { checked: idleSessions.length };
}

// 목록 조회 시 가져올 최대 알림 개수
const NOTIFICATION_LIST_LIMIT = 10;

/**
 * 로그인한 유저의 알림 목록을 최신순으로 조회합니다.
 */
export async function getNotifications(userId: string) {
  const notifications = await NotificationModel.find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(NOTIFICATION_LIST_LIMIT)
    .lean();

  return notifications.map((n) => ({
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}

/**
 * 안 읽은 알림 개수를 조회합니다. (헤더 뱃지 표시용)
 */
export async function getUnreadNotificationCount(userId: string) {
  return NotificationModel.countDocuments({
    user_id: userId,
    read_at: null,
  });
}

/**
 * 알림 하나를 읽음 처리합니다. 다른 유저의 알림은 건드리지 않도록 user_id도 함께 조건에 넣습니다.
 */
export async function markNotificationAsRead(
  userId: string,
  notificationId: string,
) {
  await NotificationModel.updateOne(
    { _id: notificationId, user_id: userId, read_at: null },
    { $set: { read_at: new Date() } },
  );
}

/**
 * 알림 하나를 삭제합니다. 다른 유저의 알림은 건드리지 않도록 user_id도 함께 조건에 넣습니다.
 */
export async function removeNotification(
  userId: string,
  notificationId: string,
) {
  await NotificationModel.deleteOne({ _id: notificationId, user_id: userId });
}
