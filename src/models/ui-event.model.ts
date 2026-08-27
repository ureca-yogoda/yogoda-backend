import { Schema, model, Types } from "mongoose";

export type UiEventElement =
  "plan_detail" | "plan_comparison" | "signup_button" | "explore_plans";

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
        "explore_plans",
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

/*
 * 같은 세션에서 같은 요소를 여러 번 보거나 눌러도 1건으로만 집계되도록 함
 * (노출/클릭 수는 "이벤트 발생 횟수"가 아니라 "그 요소를 보거나 누른 세션 수"를 의미함)
 */
uiEventSchema.index({ session_id: 1, element: 1, action: 1 }, { unique: true });

export const UiEventModel = model<IUiEvent>("UiEvent", uiEventSchema);
