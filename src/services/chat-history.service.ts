import mongoose from "mongoose";

import { FUNNEL_STAGE_ORDER } from "../constants/funnel-stage.js";
import {
  ChatMessageModel,
  type ChatMessageRole,
  type ChatMessageType,
  type IChatMessagePlanCard,
  type IChatMessagePreselectedPlan,
} from "../models/chat-message.model.js";
import {
  ChatSessionModel,
  type ChatSessionFunnelStage,
} from "../models/chat-session.model.js";
import { getActivePromptVersion } from "./prompt.service.js";
import { clearConsultationIncompleteNotification } from "./notification.service.js";
import type { SurveyAnswers } from "../types/chat.js";

/**
 * 회원의 가장 최근 AI 채팅 세션을 조회합니다. (채팅 내역 불러오기용)
 * 종료된(ended_at이 채워진) 세션은 제외함 — 그렇지 않으면 "채팅 나가기" 직후
 * 새 세션이 아직 생성되기 전에 새로고침했을 때, 방금 끝낸 옛 대화가 그대로
 * 복원되는 문제가 있었음(진행 중인 대화가 없으면 null을 반환해 새 웰컴 화면으로 시작함)
 */
export async function findLatestAIChatSession(userId: string) {
  return ChatSessionModel.findOne({
    user_id: userId,
    type: "AIChat",
    ended_at: null,
  }).sort({
    updated_at: -1,
  });
}

/*
 * status는 disconnect 시점에 "이제 끝났다"고 확정한 값이라, 다시 연결해서 대화를
 * 이어가면 아직 끝난 게 아니므로 null로 되돌려야 나중에 정확히 재확정됨
 */
async function reactivateSession(
  session: NonNullable<Awaited<ReturnType<typeof ChatSessionModel.findOne>>>,
  userId: string | null,
) {
  let needsSave = false;

  if (userId && session.user_id === null) {
    session.user_id = userId;
    needsSave = true;
  }

  if (session.status !== null) {
    session.status = null;
    needsSave = true;
  }

  if (needsSave) {
    await session.save();
  }

  return session;
}

/**
 * 소켓이 연결되는 시점에 세션을 확보합니다. (회원/비회원 공통)
 * 비회원 세션에 로그인 유저가 들어오면 새로 만들지 않고 그 자리에서 user_id만 채워
 * 승격시켜서, 퍼널 기록이 세션 두 개로 쪼개지지 않게 합니다.
 */
export async function resolveChatSession(
  userId: string | null,
  sessionId?: string,
) {
  if (sessionId && mongoose.isValidObjectId(sessionId)) {
    const ownershipFilter = userId
      ? { $or: [{ user_id: userId }, { user_id: null }] }
      : { user_id: null };

    const session = await ChatSessionModel.findOne({
      _id: sessionId,
      type: "AIChat",
      ended_at: null,
      ...ownershipFilter,
    });

    if (session) {
      await reactivateSession(session, userId);
      return { session, isNewSession: false };
    }
  }

  /*
   * 로그인 유저인데 sessionId가 없거나 못 찾았으면, 새로 만들기 전에 그 유저의
   * 진행 중인 최신 세션이 있는지 먼저 확인함. 클라이언트가 sessionId를 깜빡 안 보내도
   * 세션이 쪼개지지 않도록 하는 안전장치
   */
  if (userId) {
    const latestSession = await ChatSessionModel.findOne({
      user_id: userId,
      type: "AIChat",
      ended_at: null,
    }).sort({ updated_at: -1 });

    if (latestSession) {
      await reactivateSession(latestSession, userId);
      return { session: latestSession, isNewSession: false };
    }
  }

  const promptVersion = await getActivePromptVersion();
  const session = await ChatSessionModel.create({
    user_id: userId,
    type: "AIChat",
    prompt_version: promptVersion,
  });

  return { session, isNewSession: true };
}

/**
 * 회원이 "채팅 끝내기"를 누른 세션을 종료 처리합니다.
 * 본인 소유의 진행 중인 세션이 아니면 아무 것도 하지 않습니다.
 */
export async function endChatSession(userId: string, sessionId: string) {
  const result = await ChatSessionModel.updateOne(
    { _id: sessionId, user_id: userId, type: "AIChat", ended_at: null },
    { $set: { ended_at: new Date() } },
  );

  if (result.modifiedCount > 0) {
    // 세션이 끝났으니 "상담 미완료" 리마인드 알림이 남아있었다면 함께 지움
    await clearConsultationIncompleteNotification(userId, sessionId);
  }
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
    messageType: (doc.message_type ?? "text") as ChatMessageType,
    plans: doc.plans,
    signupData: doc.signup_data,
    preselectedPlan: doc.preselected_plan,
    createdAt: doc.created_at,
  }));
}

/**
 * 메시지 한 건을 세션에 저장하고 세션의 updated_at을 갱신합니다.
 * messageType이 카드 타입(fraud_warning, terms 등)이면 content는 빈 문자열로 저장하며,
 * 재접속·관리자 열람 시 카드를 그대로 복원하는 데 사용됩니다.
 */
export async function saveMessage(
  sessionId: string,
  role: ChatMessageRole,
  content: string,
  plans?: IChatMessagePlanCard[],
  messageType?: ChatMessageType,
  signupData?: Record<string, unknown>,
  preselectedPlan?: IChatMessagePreselectedPlan,
) {
  await ChatMessageModel.create({
    session_id: sessionId,
    role,
    content,
    plans,
    message_type: messageType ?? "text",
    signup_data: signupData,
    preselected_plan: preselectedPlan,
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
  interactionId: string | null,
) {
  await ChatSessionModel.updateOne(
    { _id: sessionId },
    { $set: { last_interaction_id: interactionId } },
  );
}

/**
 * 세션이 도달한 퍼널 단계를 기록합니다. (이미 기록된 단계보다 앞선 단계일 때만 갱신)
 */
export async function recordConversionEvent(
  sessionId: string,
  stage: ChatSessionFunnelStage,
) {
  const session =
    await ChatSessionModel.findById(sessionId).select("last_stage");
  if (!session) return;

  const currentOrder = session.last_stage
    ? FUNNEL_STAGE_ORDER[session.last_stage]
    : 0;

  if (FUNNEL_STAGE_ORDER[stage] <= currentOrder) return;

  session.last_stage = stage;
  await session.save();
}

/**
 * 소켓 연결이 끊길 때, 아직 판정되지 않은(status: null) 세션의 status를
 * last_stage 기준으로 확정합니다. 이미 확정된 세션은 건드리지 않습니다.
 * 사용자가 한 번도 답장하지 않은 세션(메시지가 아예 없거나, 웰컴/가입 인삿말 같은
 * AI 메시지만 있는 경우)은 실제 상담으로 볼 수 없으므로 세션과 그 메시지를
 * 통째로 삭제합니다. (ui_events는 세션 status와 무관하게 독립적으로 집계되므로 영향 없음)
 */
export async function finalizeSessionStatus(sessionId: string) {
  const session = await ChatSessionModel.findById(sessionId).select(
    "status last_stage user_id",
  );
  if (!session || session.status !== null) return;

  const hasUserMessage = await ChatMessageModel.exists({
    session_id: sessionId,
    role: "user",
  });

  if (!hasUserMessage) {
    await ChatMessageModel.deleteMany({ session_id: sessionId });
    await ChatSessionModel.deleteOne({ _id: sessionId });
    if (session.user_id) {
      // 세션 자체가 사라졌으니 "상담 미완료" 리마인드 알림도 함께 지움
      await clearConsultationIncompleteNotification(session.user_id, sessionId);
    }
    return;
  }

  session.status =
    session.last_stage === "signup_completed" ? "completed" : "dropped";
  await session.save();
}

/**
 * 로그인 직후, 비회원 상태로 이미 진행 중이던 세션을 그대로 회원 세션으로 승격시킵니다.
 * 메시지는 소켓 연결 시점부터 이미 이 세션에 실시간 저장돼 있으므로 복사할 필요가 없고,
 * user_id만 채워주면 됩니다. (다른 유저가 소유한 세션이나 이미 종료된 세션은 승격하지 않음)
 */
export async function claimGuestSession(userId: string, sessionId: string) {
  if (!mongoose.isValidObjectId(sessionId)) return null;

  return ChatSessionModel.findOneAndUpdate(
    { _id: sessionId, type: "AIChat", user_id: null, ended_at: null },
    { $set: { user_id: userId } },
    { returnDocument: "after" },
  );
}

/**
 * 채팅 기록을 관리자가 열람하는 것에 대한 사용자 동의를 기록합니다.
 * 동의하지 않아도 채팅 자체는 계속 이용할 수 있으며, 이 값은 관리자 채팅 로그
 * 상세 조회 시에만 영향을 줍니다.
 */
export async function recordChatLogConsent(
  sessionId: string,
  consented: boolean,
) {
  await ChatSessionModel.updateOne(
    { _id: sessionId },
    { $set: { chat_log_consent: consented, consent_at: new Date() } },
  );
}

// ─── 가입 플로우 데이터 저장 ───────────────────────────────────────────────────

/**
 * 가입 플로우에서 AI가 매 턴 반환하는 signupData를 세션에 누적 저장합니다.
 * 세션이 끊기고 재연결돼도 가입 진행 상태가 유지됩니다.
 */
export async function updateSignupCollectedData(
  sessionId: string,
  signupData: Record<string, unknown>,
): Promise<void> {
  await ChatSessionModel.findByIdAndUpdate(sessionId, {
    $set: { signup_collected_data: signupData },
  });
}
