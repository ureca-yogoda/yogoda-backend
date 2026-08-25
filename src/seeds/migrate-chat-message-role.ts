import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { ChatMessageModel } from "../models/chat-message.model.js";

/*
 * AI 응답 메시지가 예전에는 role: "admin"으로 저장됐음 (AdminChat용 필드를 재사용하던 구조).
 * AdminChat 기능은 실제로 구현된 적이 없어 기존 "admin" 메시지는 전부 AI 응답이므로,
 * 안전하게 일괄로 "ai"로 바꿔줌
 */
async function migrateChatMessageRole() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  // "admin"은 더 이상 유효한 role이 아니라 스키마 타입에 없어, 타입 검사를 우회하는
  // raw 컬렉션으로 조회함
  const result = await ChatMessageModel.collection.updateMany(
    { role: "admin" },
    { $set: { role: "ai" } },
  );

  console.log(
    `✅ role: "admin" → "ai" 마이그레이션 완료: ${result.modifiedCount}건`,
  );

  await mongoose.connection.close();
}

migrateChatMessageRole().catch(async (error: unknown) => {
  console.error("❌ chat_messages role 마이그레이션 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
