import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { ChatMessageModel } from "../models/chat-message.model.js";
import { ChatSessionModel } from "../models/chat-session.model.js";

/*
 * 채팅창만 열었다 메시지 없이 닫은 세션(chat_messages가 0건)을 정리함.
 * finalizeSessionStatus가 이제 이런 세션을 disconnect 시점에 바로 삭제하지만,
 * 그 수정 이전에 이미 DB에 쌓인 기존 세션들은 여기서 한 번에 정리해야 함.
 * 방금 연결돼 아직 첫 메시지를 안 보낸 진행 중인 세션까지 지우지 않도록,
 * 생성된 지 1시간이 지난 세션만 정리 대상으로 삼음
 */
const SAFETY_MARGIN_MS = 60 * 60 * 1000;

async function cleanupEmptyChatSessions() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  const cutoff = new Date(Date.now() - SAFETY_MARGIN_MS);
  const sessionIdsWithMessages = await ChatMessageModel.distinct("session_id");

  const result = await ChatSessionModel.deleteMany({
    type: "AIChat",
    created_at: { $lt: cutoff },
    _id: { $nin: sessionIdsWithMessages },
  });

  console.log(`✅ 메시지 없는 세션 ${result.deletedCount}건 삭제 완료`);

  await mongoose.connection.close();
}

cleanupEmptyChatSessions().catch(async (error: unknown) => {
  console.error("❌ 빈 세션 정리 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
