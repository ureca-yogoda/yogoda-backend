import { Schema, model, Types } from "mongoose";

export type UiEventElement =
  | "plan_detail"
  | "plan_comparison"
  | "signup_button"
  | "benefit_detail"
  | "agent_connect";

export type UiEventAction = "view" | "click";

export interface IUiEvent {
  _id: Types.ObjectId;
  session_id: string;
  element: UiEventElement;
  action: UiEventAction;
  created_at: Date;
}

const uiEventSchema = new Schema<IUiEvent>(
  {
    session_id: { type: String, required: true },
    element: {
      type: String,
      required: true,
      enum: [
        "plan_detail",
        "plan_comparison",
        "signup_button",
        "benefit_detail",
        "agent_connect",
      ],
    },
    action: { type: String, required: true, enum: ["view", "click"] },
  },
  {
    collection: "ui_events",
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  },
);

// UI 요소별 성과 집계(노출/클릭 수, 기간 필터) 시 사용
uiEventSchema.index({ element: 1, action: 1, created_at: 1 });

// 특정 세션의 UI 이벤트 조회 시 사용
uiEventSchema.index({ session_id: 1 });

export const UiEventModel = model<IUiEvent>("UiEvent", uiEventSchema);
