import { randomUUID } from "crypto";
import { Schema, model } from "mongoose";

export type ChatMessageRole = "user" | "admin";

export interface IChatMessage {
  _id: string;
  session_id: string;
  role: ChatMessageRole;
  content: string;
  created_at: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    _id: { type: String, default: () => randomUUID() },
    session_id: { type: String, required: true },
    // AIChat 세션에서는 "admin"이 AI 응답을, AdminChat 세션에서는 실제 상담원 답변을 의미함
    role: { type: String, required: true, enum: ["user", "admin"] },
    content: { type: String, required: true },
  },
  {
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
