import { randomUUID } from "crypto";
import { Schema, model } from "mongoose";

export type ChatMessageRole = "user" | "ai";

export interface IChatMessagePlanCard {
  code: string;
  badge: string;
  name: string;
  price: string;
  specs: string;
  savings: string;
  matchRate: string;
}

export type ChatMessageType =
  "text" | "fraud_warning" | "terms" | "signup_summary" | "signup_complete";

export interface IChatMessagePreselectedPlan {
  code: string;
  name: string;
  monthlyFee: number;
}

export interface IChatMessage {
  _id: string;
  session_id: string;
  role: ChatMessageRole;
  content: string;
  message_type?: ChatMessageType;
  plans?: IChatMessagePlanCard[];
  signup_data?: Record<string, unknown>;
  preselected_plan?: IChatMessagePreselectedPlan;
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
    role: { type: String, required: true, enum: ["user", "ai"] },
    content: { type: String, required: true },
    message_type: {
      type: String,
      enum: [
        "text",
        "fraud_warning",
        "terms",
        "signup_summary",
        "signup_complete",
      ],
      default: "text",
    },
    plans: { type: [chatMessagePlanCardSchema], required: false },
    signup_data: { type: Schema.Types.Mixed, required: false },
    preselected_plan: {
      type: new Schema(
        { code: String, name: String, monthlyFee: Number },
        { _id: false },
      ),
      required: false,
    },
  },
  {
    collection: "chat_messages",
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  },
);

// 세션별 시간순 조회 인덱스
chatMessageSchema.index({ session_id: 1, created_at: 1 });

export const ChatMessageModel = model<IChatMessage>(
  "ChatMessage",
  chatMessageSchema,
);
