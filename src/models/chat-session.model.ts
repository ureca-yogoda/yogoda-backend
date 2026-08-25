import { Schema, model, Types } from "mongoose";

export type ChatSessionType = "AIChat" | "AdminChat";

export type ChatSessionStatus = "completed" | "dropped";

export type ChatSessionFunnelStage =
  | "consultation_started"
  | "recommendation_completed"
  | "plan_comparison_viewed"
  | "signup_started"
  | "signup_completed";

export interface IChatSession {
  _id: Types.ObjectId;
  user_id: string;
  type: ChatSessionType;
  collected_info: Record<string, string> | null;
  last_interaction_id: string | null;
  // 사용자가 "채팅 끝내기"를 누른 시각. null이면 진행 중인 세션임
  ended_at: Date | null;
  // 세션 생성 시점의 활성 프롬프트 버전. 소켓 연동 전까지는 null
  prompt_version: string | null;
  // 재시작/연결 끊김 시 last_stage 기준으로 결정됨. 세션 종료 전까지는 null
  status: ChatSessionStatus | null;
  // 사용자가 도달한 마지막 퍼널 단계. 아직 아무 단계에도 도달하지 않았으면 null
  last_stage: ChatSessionFunnelStage | null;
  created_at: Date;
  updated_at: Date;
}

const chatSessionSchema = new Schema<IChatSession>(
  {
    user_id: { type: String, required: true },
    type: { type: String, required: true, enum: ["AIChat", "AdminChat"] },
    /*
     * 대화로 파악된 정보(데이터 사용량/OTT 선호 등)를 세션에 함께 저장해두면,
     * 다음 턴 요청마다 전체 대화 기록을 다시 해석하지 않아도 "이미 아는 정보"를
     * 바로 프롬프트에 넣어줄 수 있어 반복 질문을 줄일 수 있음
     */
    collected_info: { type: Schema.Types.Mixed, default: null },
    /*
     * Gemini Interactions API가 서버 쪽에서 관리하는 대화 맥락을 이어가기 위한 토큰.
     * 다음 요청에 previous_interaction_id로 그대로 다시 넣어줘야 대화가 이어짐
     */
    last_interaction_id: { type: String, default: null },
    ended_at: { type: Date, default: null },
    prompt_version: { type: String, default: null },
    status: {
      type: String,
      enum: ["completed", "dropped"],
      default: null,
    },
    last_stage: {
      type: String,
      enum: [
        "consultation_started",
        "recommendation_completed",
        "plan_comparison_viewed",
        "signup_started",
        "signup_completed",
      ],
      default: null,
    },
  },
  {
    collection: "chat_sessions",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 유저의 가장 최근 대화 세션을 조회할 때 사용
chatSessionSchema.index({ user_id: 1, type: 1, updated_at: -1 });

// 관리자 대시보드/세션 목록의 기간·상태·이탈 단계·프롬프트 버전 필터링에 사용
chatSessionSchema.index({
  status: 1,
  last_stage: 1,
  prompt_version: 1,
  created_at: -1,
});

export const ChatSessionModel = model<IChatSession>(
  "ChatSession",
  chatSessionSchema,
);
