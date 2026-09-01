import mongoose, { Types } from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { AttendanceRecordModel } from "../models/attendance-record.model.js";
import { MembershipTierModel } from "../models/membership-tier.model.js";
import { PartnerBrandModel } from "../models/partner-brand.model.js";
import { BenefitModel } from "../models/benefit.model.js";
import { BenefitLocationModel } from "../models/benefit-location.model.js";
import { MissionModel } from "../models/mission.model.js";
import { NotificationModel } from "../models/notification.model.js";
import { PlanModel } from "../models/plan.model.js";
import { StoreModel } from "../models/store.model.js";

const apply = process.argv.includes("--apply");
const migratedCollections = [
  "benefits",
  "plans",
  "stores",
  "benefit_locations",
  "missions",
  "attendance_records",
  "notifications",
] as const;

const membershipTiers = [
  { code: "good", name: "우수", level: 1, min_monthly_fee: 0 },
  { code: "vip", name: "VIP", level: 2, min_monthly_fee: 0 },
  { code: "vvip", name: "VVIP", level: 3, min_monthly_fee: 0 },
];

const brandCategories: Record<string, string> = {
  "U+": "telecom",
  "U+ 멤버십": "membership",
  "N Pay": "payment",
  CGV: "culture",
  배달의민족: "food",
  올리브영: "shopping",
  스타벅스: "food",
};

function brandCode(name: string) {
  const known: Record<string, string> = {
    "U+": "uplus",
    "U+ 멤버십": "uplus-membership",
    "N Pay": "naver-pay",
    CGV: "cgv",
    배달의민족: "baemin",
    올리브영: "olive-young",
    스타벅스: "starbucks",
  };
  return known[name] ?? `brand-${Buffer.from(name).toString("hex")}`;
}

function snakeKey(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toSnakeCaseDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSnakeCaseDeep);
  if (!value || typeof value !== "object" || value instanceof Date) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      snakeKey(key),
      toSnakeCaseDeep(item),
    ]),
  );
}

async function inspect() {
  const db = mongoose.connection.db!;
  const [brands, planTiers, benefitTiers] = await Promise.all([
    db.collection("benefits").distinct("brand", { brand: { $type: "string" } }),
    db
      .collection("plans")
      .distinct("membershipTier", { membershipTier: { $type: "string" } }),
    db.collection("benefits").distinct("minMembershipTier", {
      minMembershipTier: { $type: "string" },
    }),
  ]);
  const notificationUserIds = await db
    .collection("notifications")
    .distinct("user_id", { user_id: { $type: "string" } });
  const counts = await Promise.all([
    db
      .collection("benefits")
      .countDocuments({ benefitType: { $exists: true } }),
    db
      .collection("benefits")
      .countDocuments({ benefit_type: { $exists: true } }),
    db
      .collection("benefits")
      .countDocuments({ brand: { $type: "string" }, brand_id: null }),
    db.collection("plans").countDocuments({ productLine: { $exists: true } }),
    db.collection("plans").countDocuments({ product_line: { $exists: true } }),
    db.collection("plans").countDocuments({
      membershipTier: { $type: "string" },
      membership_tier_id: null,
    }),
    db
      .collection("missions")
      .countDocuments({ recommendationWeight: { $exists: true } }),
    db
      .collection("missions")
      .countDocuments({ recommendation_weight: { $exists: true } }),
    db
      .collection("attendance_records")
      .countDocuments({ date_key: { $exists: true } }),
    db
      .collection("attendance_records")
      .countDocuments({ attendance_date: { $exists: true } }),
  ]);

  const knownTierNames = new Set(membershipTiers.map((tier) => tier.name));
  const normalizedPlanTiers = planTiers.map((name) =>
    String(name).startsWith("VIP") ? "VIP" : String(name),
  );
  const unknownTiers = [...normalizedPlanTiers, ...benefitTiers]
    .map(String)
    .filter((name) => !knownTierNames.has(name));

  return {
    brands: brands.map(String),
    unknownBrands: brands.map(String).filter((name) => !brandCategories[name]),
    unknownTiers: [...new Set(unknownTiers)],
    invalidNotificationUserIds: notificationUserIds
      .map(String)
      .filter((id) => !Types.ObjectId.isValid(id)),
    migrationCounts: {
      legacyBenefits: counts[0],
      migratedBenefits: counts[1],
      benefitsMissingBrandId: counts[2],
      legacyPlans: counts[3],
      migratedPlans: counts[4],
      plansMissingTierId: counts[5],
      legacyMissions: counts[6],
      migratedMissions: counts[7],
      legacyAttendanceRecords: counts[8],
      migratedAttendanceRecords: counts[9],
    },
  };
}

async function createBackups() {
  const db = mongoose.connection.db!;
  const suffix = new Date().toISOString().replaceAll(/[-:.TZ]/g, "");
  const backups: string[] = [];

  for (const collectionName of migratedCollections) {
    const backupName = `schema_backup_${suffix}_${collectionName}`;
    const documents = await db.collection(collectionName).find({}).toArray();
    if (documents.length > 0) {
      await db.collection(backupName).insertMany(documents, { ordered: false });
    } else {
      await db.createCollection(backupName);
    }
    backups.push(backupName);
  }

  console.log("롤백용 백업 컬렉션 생성 완료", backups);
}

async function upsertReferences(brandNames: string[]) {
  await MembershipTierModel.bulkWrite(
    membershipTiers.map((tier) => ({
      updateOne: {
        filter: { code: tier.code },
        update: {
          $set: { ...tier, description: null, is_active: true },
        },
        upsert: true,
      },
    })),
  );

  await PartnerBrandModel.bulkWrite(
    brandNames.map((name, index) => ({
      updateOne: {
        filter: { code: brandCode(name) },
        update: {
          $set: {
            name,
            category: brandCategories[name],
            logo_url: null,
            description: null,
            is_active: true,
            sort_order: index,
          },
        },
        upsert: true,
      },
    })),
  );
}

async function connectReferences() {
  const db = mongoose.connection.db!;
  const tiers = await MembershipTierModel.find().lean();
  const tierByName = new Map(tiers.map((tier) => [tier.name, tier._id]));
  const brands = await PartnerBrandModel.find().lean();
  const brandByName = new Map(brands.map((brand) => [brand.name, brand._id]));

  for (const [name, id] of brandByName) {
    await db
      .collection("benefits")
      .updateMany({ brand: name }, { $set: { brand_id: id } });
  }
  for (const [name, id] of tierByName) {
    await db
      .collection("benefits")
      .updateMany(
        { minMembershipTier: name },
        { $set: { min_membership_tier_id: id } },
      );
    await db
      .collection("plans")
      .updateMany(
        name === "VIP" ? { membershipTier: /^VIP/ } : { membershipTier: name },
        { $set: { membership_tier_id: id } },
      );
  }
}

async function renameFields() {
  const db = mongoose.connection.db!;
  await db
    .collection("benefits")
    .updateMany({ benefitType: { $exists: true } }, [
      {
        $set: {
          benefit_type: "$benefitType",
          usage_limit: "$usageLimit",
          min_plan_monthly_fee: "$minPlanMonthlyFee",
          recommended_plan_codes: "$recommendedPlanCodes",
          target_user_tags: "$targetUserTags",
          recommendation_weight: "$recommendationWeight",
          start_date: "$period.startsAt",
          end_date: "$period.endsAt",
          source_url: "$sourceUrl",
          source_checked_at: "$sourceCheckedAt",
          is_active: "$isActive",
          sort_order: "$sortOrder",
          calendar_day: "$calendarDay",
        },
      },
      {
        $unset: [
          "benefitType",
          "usageLimit",
          "minPlanMonthlyFee",
          "recommendedPlanCodes",
          "targetUserTags",
          "recommendationWeight",
          "period",
          "sourceUrl",
          "sourceCheckedAt",
          "isActive",
          "sortOrder",
          "calendarDay",
        ],
      },
    ]);

  await db.collection("plans").updateMany({ productLine: { $exists: true } }, [
    {
      $set: {
        product_line: "$productLine",
        monthly_fee: "$monthlyFee",
        discount_fee: "$discountFee",
        additional_voice: "$additionalVoice",
        smart_device_benefit: "$smartDeviceBenefit",
        benefit_details: "$benefitDetails",
        choice_benefits: "$choiceBenefits",
        is_popular: "$isPopular",
        popular_order: "$popularOrder",
        recommendation_tags: "$recommendationTags",
        source_url: "$sourceUrl",
        source_checked_at: "$sourceCheckedAt",
        is_active: "$isActive",
        sort_order: "$sortOrder",
      },
    },
    {
      $unset: [
        "productLine",
        "monthlyFee",
        "discountFee",
        "additionalVoice",
        "smartDeviceBenefit",
        "benefitDetails",
        "choiceBenefits",
        "isPopular",
        "popularOrder",
        "recommendationTags",
        "sourceUrl",
        "sourceCheckedAt",
        "isActive",
        "sortOrder",
      ],
    },
  ]);

  const plans = await db.collection("plans").find({}).toArray();
  for (const plan of plans) {
    await db.collection("plans").updateOne(
      { _id: plan._id },
      {
        $set: {
          data: toSnakeCaseDeep(plan.data),
          promotion: toSnakeCaseDeep(plan.promotion),
          benefit_details: toSnakeCaseDeep(plan.benefit_details ?? []),
          choice_benefits: toSnakeCaseDeep(plan.choice_benefits ?? []),
        },
      },
    );
  }

  await db
    .collection("stores")
    .updateMany({ weekdayHours: { $exists: true } }, [
      {
        $set: {
          weekday_hours: "$weekdayHours",
          saturday_hours: "$saturdayHours",
          sunday_hours: "$sundayHours",
          is_direct: "$isDirect",
          is_active: "$isActive",
          source_url: "$sourceUrl",
        },
      },
      {
        $unset: [
          "weekdayHours",
          "saturdayHours",
          "sundayHours",
          "isDirect",
          "isActive",
          "sourceUrl",
        ],
      },
    ]);
  await db
    .collection("benefit_locations")
    .updateMany({ isActive: { $exists: true } }, [
      { $set: { is_active: "$isActive" } },
      { $unset: "isActive" },
    ]);

  await db
    .collection("missions")
    .updateMany({ recommendationWeight: { $exists: true } }, [
      {
        $set: {
          target_count: { $ifNull: ["$target_count", 1] },
          reward_points: {
            $ifNull: [
              "$reward_points",
              {
                $switch: {
                  branches: [
                    { case: { $eq: ["$category", "attendance"] }, then: 30 },
                    { case: { $eq: ["$category", "profile"] }, then: 50 },
                    { case: { $eq: ["$category", "referral"] }, then: 200 },
                  ],
                  default: 100,
                },
              },
            ],
          },
          start_date: "$period.startsAt",
          end_date: "$period.endsAt",
          target_user_tags: "$targetUserTags",
          recommendation_weight: "$recommendationWeight",
          source_url: "$sourceUrl",
          source_checked_at: "$sourceCheckedAt",
          is_active: "$isActive",
          sort_order: "$sortOrder",
        },
      },
      {
        $unset: [
          "reward",
          "period",
          "targetUserTags",
          "recommendationWeight",
          "sourceUrl",
          "sourceCheckedAt",
          "isActive",
          "sortOrder",
        ],
      },
    ]);

  const legacyAttendanceRecords = await db
    .collection("attendance_records")
    .find({ date_key: { $exists: true } })
    .toArray();
  const attendanceIndexes = await db.collection("attendance_records").indexes();
  if (
    attendanceIndexes.some((index) => index.name === "user_id_1_date_key_1")
  ) {
    // 구형 고유 인덱스가 date_key 제거 중 null 중복을 만들므로 변환 전에 제거함
    await db.collection("attendance_records").dropIndex("user_id_1_date_key_1");
  }
  for (const record of legacyAttendanceRecords) {
    const duplicate = await db.collection("attendance_records").findOne({
      _id: { $ne: record._id },
      user_id: record.user_id,
      attendance_date: record.date_key,
    });
    if (duplicate) {
      await db.collection("attendance_records").deleteOne({ _id: record._id });
      continue;
    }
    await db.collection("attendance_records").updateOne(
      { _id: record._id },
      {
        $set: {
          attendance_date: record.date_key,
          reward_points: record.points,
        },
        $unset: { date_key: "", checked_at: "", points: "" },
      },
    );
  }

  const legacyNotifications = await db
    .collection("notifications")
    .find({ user_id: { $type: "string" } })
    .toArray();
  for (const notification of legacyNotifications) {
    const userId = new Types.ObjectId(String(notification.user_id));
    const duplicate = await db.collection("notifications").findOne({
      _id: { $ne: notification._id },
      user_id: userId,
      dedupe_key: notification.dedupe_key,
    });
    if (duplicate) {
      // 새 ObjectId 알림을 유지하고 동일한 구형 문자열 ID 알림만 제거함
      await db.collection("notifications").deleteOne({
        _id: notification._id,
      });
      continue;
    }
    await db
      .collection("notifications")
      .updateOne({ _id: notification._id }, { $set: { user_id: userId } });
  }
}

async function run() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();
  const report = await inspect();
  console.log("스키마 전환 사전 검사", report);

  if (!apply) {
    console.log("검사만 완료함. 실제 적용은 --apply 옵션이 필요함");
    return;
  }
  if (
    report.unknownBrands.length ||
    report.unknownTiers.length ||
    report.invalidNotificationUserIds.length
  ) {
    throw new Error("알 수 없는 브랜드 또는 멤버십 등급이 있어 적용을 중단함");
  }

  await createBackups();
  await upsertReferences(report.brands);
  await connectReferences();
  await renameFields();
  await Promise.all([
    AttendanceRecordModel.syncIndexes(),
    MembershipTierModel.syncIndexes(),
    PartnerBrandModel.syncIndexes(),
    BenefitModel.syncIndexes(),
    BenefitLocationModel.syncIndexes(),
    MissionModel.syncIndexes(),
    NotificationModel.syncIndexes(),
    PlanModel.syncIndexes(),
    StoreModel.syncIndexes(),
  ]);
  console.log("스키마 표준화 마이그레이션 완료");
}

run()
  .catch((error: unknown) => {
    console.error("스키마 표준화 마이그레이션 실패", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
