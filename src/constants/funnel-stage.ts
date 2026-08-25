import type { ChatSessionFunnelStage } from "../models/chat-session.model.js";

// 퍼널 진행 순서 (이 순서 자체가 곧 단계 순번의 기준임)
export const FUNNEL_STAGES: ChatSessionFunnelStage[] = [
  "consultation_started",
  "recommendation_completed",
  "plan_comparison_viewed",
  "signup_started",
  "signup_completed",
];

export const FUNNEL_STAGE_ORDER: Record<ChatSessionFunnelStage, number> =
  Object.fromEntries(
    FUNNEL_STAGES.map((stage, index) => [stage, index + 1]),
  ) as Record<ChatSessionFunnelStage, number>;

export const FUNNEL_STAGE_LABELS: Record<ChatSessionFunnelStage, string> = {
  consultation_started: "상담 시작",
  recommendation_completed: "추천 완료",
  plan_comparison_viewed: "요금제 비교",
  signup_started: "가입 신청",
  signup_completed: "가입 완료",
};
