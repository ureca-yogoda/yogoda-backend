import { Schema, model, Types } from "mongoose";

export interface IPrompt {
  _id: Types.ObjectId;
  version: string;
  content: string;
  summary: string;
  is_active: boolean;
  deployed_at: Date;
  deployed_by: Types.ObjectId;
  char_count: number;
  created_at: Date;
  updated_at: Date;
}

const promptSchema = new Schema<IPrompt>(
  {
    version: { type: String, required: true, unique: true },
    content: { type: String, required: true },
    summary: { type: String, required: true },
    is_active: { type: Boolean, required: true, default: false },
    deployed_at: { type: Date, required: true },
    deployed_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    char_count: { type: Number, required: true },
  },
  {
    collection: "prompts",
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

// 활성 프롬프트 조회 시 사용
promptSchema.index({ is_active: 1 });

export const PromptModel = model<IPrompt>("Prompt", promptSchema);
