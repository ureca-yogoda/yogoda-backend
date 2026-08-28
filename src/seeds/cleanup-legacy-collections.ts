import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";

const collectionMappings = [
  ["usercoupons", "user_coupons"],
  ["usermissions", "user_missions"],
  ["savedbenefits", "saved_benefits"],
  ["attendancerecords", "attendance_records"],
  ["pointtransactions", "point_transactions"],
] as const;

const obsoleteCollections = [
  "recommendations",
  "coupons",
  "plan_benefits",
  "plan_membership_tiers",
  "membership_benefits",
  "user_saved_brands",
] as const;

async function verifyAndDropLegacyCollection(
  sourceName: string,
  targetName: string,
) {
  const db = mongoose.connection.db!;
  const existingNames = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      (collection) => collection.name,
    ),
  );

  if (!existingNames.has(sourceName)) {
    console.log(`- ${sourceName}: 기존 컬렉션 없음`);
    return;
  }

  const sourceIds = await db
    .collection(sourceName)
    .find({}, { projection: { _id: 1 } })
    .toArray();
  const targetCount = await db.collection(targetName).countDocuments({
    _id: { $in: sourceIds.map(({ _id }) => _id) },
  });

  if (targetCount !== sourceIds.length) {
    throw new Error(
      `${sourceName}: 복사 검증 실패 (기존 ${sourceIds.length}건, 신규 일치 ${targetCount}건)`,
    );
  }

  // 모든 기존 문서가 신규 컬렉션에 있는 경우에만 삭제함
  await db.collection(sourceName).drop();
  console.log(
    `✅ ${sourceName}: ${sourceIds.length}건 검증 후 컬렉션 삭제 완료`,
  );
}

async function cleanupLegacyCollections() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  for (const [source, target] of collectionMappings) {
    await verifyAndDropLegacyCollection(source, target);
  }

  const db = mongoose.connection.db!;
  const existingNames = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      (collection) => collection.name,
    ),
  );
  for (const collectionName of obsoleteCollections) {
    if (!existingNames.has(collectionName)) continue;
    const count = await db.collection(collectionName).countDocuments();
    if (count > 0) {
      throw new Error(
        `${collectionName}: ${count}건이 남아 있어 자동 삭제를 중단함`,
      );
    }
    await db.collection(collectionName).drop();
    console.log(`✅ ${collectionName}: 빈 레거시 컬렉션 삭제 완료`);
  }

  await mongoose.connection.close();
}

cleanupLegacyCollections().catch(async (error: unknown) => {
  console.error("❌ 기존 컬렉션 정리 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
