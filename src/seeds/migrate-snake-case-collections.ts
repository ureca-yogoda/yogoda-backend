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

async function migrateCollection(sourceName: string, targetName: string) {
  const db = mongoose.connection.db!;
  const existingNames = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      (collection) => collection.name,
    ),
  );

  if (!existingNames.has(sourceName)) {
    return 0;
  }

  const documents = await db.collection(sourceName).find({}).toArray();
  if (documents.length === 0) {
    return 0;
  }

  await db.collection(targetName).bulkWrite(
    documents.map((document) => ({
      replaceOne: {
        filter: { _id: document._id },
        replacement: document,
        upsert: true,
      },
    })),
  );

  return documents.length;
}

async function migrateSnakeCaseCollections() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  for (const [source, target] of collectionMappings) {
    const count = await migrateCollection(source, target);
    console.log(`✅ ${source} → ${target}: ${count}건 복사 완료`);
  }

  // 기존 컬렉션은 검증과 롤백을 위해 자동 삭제하지 않음
  await mongoose.connection.close();
}

migrateSnakeCaseCollections().catch(async (error: unknown) => {
  console.error("❌ 컬렉션 마이그레이션 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
