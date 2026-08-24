import { Schema, model, Types } from "mongoose";

export type ChatSessionType = "AIChat" | "AdminChat";

export interface IChatSession {
  _id: Types.ObjectId;
  user_id: string;
  type: ChatSessionType;
  collected_info: Record<string, string> | null;
  last_interaction_id: string | null;
  // 사용자가 "채팅 끝내기"를 누른 시각. null이면 진행 중인 세션임
  ended_at: Date | null;
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
  },
  {
    collection: "chat_sessions",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 유저의 가장 최근 대화 세션을 조회할 때 사용
chatSessionSchema.index({ user_id: 1, type: 1, updated_at: -1 });

export const ChatSessionModel = model<IChatSession>(
  "ChatSession",
  chatSessionSchema,
);
