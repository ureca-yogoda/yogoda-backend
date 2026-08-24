import {
  ChatMessageModel,
  type IChatMessagePlanCard,
} from "../models/chat-message.model.js";
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
    plans: doc.plans,
    createdAt: doc.created_at,
  }));
}

/**
 * 메시지 한 건을 세션에 저장하고, 세션의 updated_at을 갱신합니다.
 * plans는 AI가 요금제를 추천한 메시지에만 함께 넘어오며, 재접속 시 카드를 그대로 복원하는 데 쓰입니다.
 */
export async function saveMessage(
  sessionId: string,
  role: "user" | "admin",
  content: string,
  plans?: IChatMessagePlanCard[],
) {
  await ChatMessageModel.create({
    session_id: sessionId,
    role,
    content,
    plans,
  });
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

export interface GuestChatMessageInput {
  role: "user" | "admin";
  content: string;
  plans?: IChatMessagePlanCard[];
}

/**
 * 비회원(게스트) 상태에서 로컬 스토리지에 쌓인 대화 내역을 로그인 직후 새 회원 세션으로 이관합니다.
 * - 기존 회원 대화 내역과 섞이지 않도록, 이 호출마다 항상 새 세션을 만들어 그 안에만 저장합니다.
 * - collectedInfo/interactionId도 함께 넘어오면 새 세션에 반영해 다음 턴부터 이어서 활용합니다.
 */
export async function importGuestChatHistory(
  userId: string,
  messages: GuestChatMessageInput[],
  collectedInfo?: SurveyAnswers,
  lastInteractionId?: string,
) {
  if (messages.length === 0) {
    return null;
  }

  const session = await ChatSessionModel.create({
    user_id: userId,
    type: "AIChat",
  });

  const sessionId = session._id.toString();

  await ChatMessageModel.insertMany(
    messages.map((m) => ({
      session_id: sessionId,
      role: m.role,
      content: m.content,
      plans: m.plans,
    })),
  );

  const update: Record<string, unknown> = { updated_at: new Date() };
  if (collectedInfo && Object.keys(collectedInfo).length > 0) {
    update.collected_info = collectedInfo;
  }
  if (lastInteractionId) {
    update.last_interaction_id = lastInteractionId;
  }

  await ChatSessionModel.updateOne({ _id: sessionId }, { $set: update });

  return ChatSessionModel.findById(sessionId);
}
