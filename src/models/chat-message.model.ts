import { randomUUID } from "crypto";
import { Schema, model } from "mongoose";

export type ChatMessageRole = "user" | "admin";

export interface IChatMessagePlanCard {
  code: string;
  badge: string;
  name: string;
  price: string;
  specs: string;
  savings: string;
  matchRate: string;
}

export interface IChatMessage {
  _id: string;
  session_id: string;
  role: ChatMessageRole;
  content: string;
  // AI가 요금제를 추천한 메시지에만 존재함 (새로고침/재접속 시에도 카드를 그대로 복원하기 위해 저장)
  plans?: IChatMessagePlanCard[];
  created_at: Date;
}

const chatMessagePlanCardSchema = new Schema<IChatMessagePlanCard>(
  {
    code: { type: String, required: true },
    badge: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: String, required: true },
    specs: { type: String, required: true },
    savings: { type: String, required: true },
    matchRate: { type: String, required: true },
  },
  { _id: false },
);

const chatMessageSchema = new Schema<IChatMessage>(
  {
    _id: { type: String, default: () => randomUUID() },
    session_id: { type: String, required: true },
    // AIChat 세션에서는 "admin"이 AI 응답을, AdminChat 세션에서는 실제 상담원 답변을 의미함
    role: { type: String, required: true, enum: ["user", "admin"] },
    content: { type: String, required: true },
    plans: { type: [chatMessagePlanCardSchema], required: false },
  },
  {
    collection: "chat_messages",
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  },
);

// 세션 하나의 대화 내역을 시간순으로 조회하기 위한 인덱스
chatMessageSchema.index({ session_id: 1, created_at: 1 });

export const ChatMessageModel = model<IChatMessage>(
  "ChatMessage",
  chatMessageSchema,
);
