import { ChatMessageModel } from "../models/chat-message.model.js";
import { ChatSessionModel } from "../models/chat-session.model.js";
import type { SurveyAnswers } from "../types/chat.js";

/**
 * 회원의 가장 최근 AI 채팅 세션을 조회합니다. (채팅 내역 불러오기용)
 */
export async function findLatestAIChatSession(userId: string) {
  return ChatSessionModel.findOne({ user_id: userId, type: "AIChat" }).sort({
    updated_at: -1,
  });
}

/**
 * sessionId로 세션을 조회하되, 본인 소유가 아니거나 없으면 새 세션을 만듭니다.
 */
export async function getOrCreateAIChatSession(
  userId: string,
  sessionId?: string,
) {
  if (sessionId) {
    const session = await ChatSessionModel.findOne({
      _id: sessionId,
      user_id: userId,
      type: "AIChat",
    });
    if (session) return session;
  }

  return ChatSessionModel.create({ user_id: userId, type: "AIChat" });
}

/**
 * 세션의 전체 대화 내역을 프론트엔드 화면 렌더링용 형태로 조회합니다.
 * (AI에게 보낼 맥락은 Interactions API의 previous_interaction_id가 대신 관리하므로,
 * 이 함수는 순수하게 채팅 화면 표시/기록용으로만 쓰임)
 */
export async function getSessionMessages(sessionId: string) {
  const docs = await ChatMessageModel.find({ session_id: sessionId })
    .sort({ created_at: 1 })
    .lean();

  return docs.map((doc) => ({
    id: doc._id,
    role: doc.role,
    content: doc.content,
    createdAt: doc.created_at,
  }));
}

/**
 * 메시지 한 건을 세션에 저장하고, 세션의 updated_at을 갱신합니다.
 */
export async function saveMessage(
  sessionId: string,
  role: "user" | "admin",
  content: string,
) {
  await ChatMessageModel.create({ session_id: sessionId, role, content });
  await ChatSessionModel.updateOne(
    { _id: sessionId },
    { $set: { updated_at: new Date() } },
  );
}

/**
 * AI가 매 턴 되돌려준 "지금까지 파악된 정보 전체"를 세션에 저장합니다.
 * 다음 턴 요청 시 이 값을 그대로 다시 프롬프트에 넣어 반복 질문을 방지합니다.
 */
export async function updateCollectedInfo(
  sessionId: string,
  collectedInfo: SurveyAnswers | undefined,
) {
  if (!collectedInfo || Object.keys(collectedInfo).length === 0) return;

  await ChatSessionModel.updateOne(
    { _id: sessionId },
    { $set: { collected_info: collectedInfo } },
  );
}

/**
 * Interactions API가 발급한 최신 interaction id를 세션에 저장합니다.
 * 다음 턴에 previous_interaction_id로 그대로 다시 넣어줘야 대화가 이어집니다.
 */
export async function updateLastInteractionId(
  sessionId: string,
  interactionId: string,
) {
  await ChatSessionModel.updateOne(
    { _id: sessionId },
    { $set: { last_interaction_id: interactionId } },
  );
}
