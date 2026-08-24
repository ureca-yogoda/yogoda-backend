import { AttendanceRecordModel } from "../models/attendance-record.model.js";
import { UserCouponModel } from "../models/user-coupon.model.js";
import { BenefitModel } from "../models/benefit.model.js";
import { SavedBenefitModel } from "../models/saved-benefit.model.js";
import { addPoints, getPointWallet } from "./point.service.js";
import { completeMissionFromAction } from "./mission.service.js";

const ATTENDANCE_POINTS = 30;

function getCalendarCategory(tags: string[]) {
  if (tags.some((tag) => ["카페", "커피", "배달", "외식"].includes(tag)))
    return "food";
  if (tags.some((tag) => ["문화", "영화"].includes(tag))) return "culture";
  if (tags.some((tag) => ["쇼핑", "뷰티"].includes(tag))) return "shopping";
  return "membership";
}

function getDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getPreviousDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  date.setDate(date.getDate() - 1);
  return getDateKey(date);
}

function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new TypeError("월은 YYYY-MM 형식이어야 해요.");
  }
}

export async function getAttendance(userId: string, month: string) {
  assertMonth(month);
  const records = await AttendanceRecordModel.find({
    user_id: userId,
    date_key: { $gte: `${month}-01`, $lte: `${month}-31` },
  })
    .sort({ date_key: 1 })
    .lean();
  const allRecords = await AttendanceRecordModel.find({ user_id: userId })
    .select("date_key")
    .sort({ date_key: -1 })
    .lean();
  const attended = new Set(allRecords.map((record) => record.date_key));
  let cursor = attended.has(getDateKey())
    ? getDateKey()
    : getPreviousDateKey(getDateKey());
  let streak = 0;
  while (attended.has(cursor)) {
    streak += 1;
    cursor = getPreviousDateKey(cursor);
  }

  return {
    month,
    today: getDateKey(),
    checkedInToday: attended.has(getDateKey()),
    streak,
    monthlyCount: records.length,
    pointsPerCheckIn: ATTENDANCE_POINTS,
    dates: records.map((record) => record.date_key),
  };
}

export async function checkIn(userId: string) {
  const dateKey = getDateKey();
  const record = await AttendanceRecordModel.findOneAndUpdate(
    { user_id: userId, date_key: dateKey },
    { $setOnInsert: { checked_at: new Date(), points: ATTENDANCE_POINTS } },
    { new: true, upsert: true },
  );
  await addPoints(
    userId,
    ATTENDANCE_POINTS,
    "요고다 출석 체크",
    `attendance:${dateKey}`,
  );
  await completeMissionFromAction(userId, "mission-uplus-one-attendance");
  return {
    date: dateKey,
    points: record.points,
    wallet: await getPointWallet(userId),
  };
}

export async function getBenefitCalendar(userId: string, month: string) {
  assertMonth(month);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59),
  );
  const [coupons, scheduledBenefits, savedBenefits] = await Promise.all([
    UserCouponModel.find({
      user_id: userId,
      status: { $ne: "revoked" },
      expires_at: { $gte: start, $lte: end },
    }).lean(),
    BenefitModel.find({ isActive: true, calendarDay: { $ne: null } })
      .sort({ calendarDay: 1, sortOrder: 1 })
      .lean(),
    SavedBenefitModel.find({ user_id: userId }).select("benefit_id").lean(),
  ]);
  const benefits = await BenefitModel.find({
    _id: { $in: coupons.map((coupon) => coupon.benefit_id) },
  }).lean();
  const benefitMap = new Map(
    benefits.map((benefit) => [benefit._id.toString(), benefit]),
  );
  const savedIds = new Set(
    savedBenefits.map((item) => item.benefit_id.toString()),
  );

  return {
    month,
    events: [
      ...scheduledBenefits.flatMap((benefit) => {
        const day = benefit.calendarDay;
        if (!day || day > end.getUTCDate()) return [];
        return [
          {
            id: `schedule:${benefit.code}:${month}`,
            benefitCode: benefit.code,
            date: `${month}-${String(day).padStart(2, "0")}`,
            title: benefit.title,
            value: benefit.value,
            status: "scheduled",
            type: "benefit" as const,
            brand: benefit.brand ?? benefit.partner,
            category: getCalendarCategory(benefit.tags ?? []),
            saved: savedIds.has(benefit._id.toString()),
          },
        ];
      }),
      ...coupons.flatMap((coupon) => {
        const benefit = benefitMap.get(coupon.benefit_id.toString());
        return benefit
          ? [
              {
                id: coupon._id.toString(),
                benefitCode: benefit.code,
                date: getDateKey(coupon.expires_at),
                title: benefit.title,
                value: benefit.value,
                status: coupon.status,
                type: "coupon" as const,
                brand: benefit.brand ?? benefit.partner,
                category: getCalendarCategory(benefit.tags ?? []),
                saved: savedIds.has(benefit._id.toString()),
              },
            ]
          : [];
      }),
    ].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
