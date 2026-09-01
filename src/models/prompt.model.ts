import { Schema, model, Types } from "mongoose";

export interface IPrompt {
  _id: Types.ObjectId;
  // 임시저장(draft) 상태에서는 아직 버전이 배정되지 않음
  version: string | null;
  // draft가 어떤 배포 버전을 베이스로 수정 중인지 (표시용)
  base_version: string | null;
  content: string;
  summary: string | null;
  status: "draft" | "deployed";
  is_active: boolean;
  deployed_at: Date | null;
  deployed_by: Types.ObjectId | null;
  // draft를 마지막으로 수정한 관리자 (배포 시 deployed_by로 대체됨)
  updated_by: Types.ObjectId | null;
  char_count: number;
  created_at: Date;
  updated_at: Date;
}

const promptSchema = new Schema<IPrompt>(
  {
    version: { type: String, unique: true, sparse: true },
    base_version: { type: String, default: null },
    content: { type: String, required: true },
    summary: { type: String, default: null },
    status: { type: String, enum: ["draft", "deployed"], default: "deployed" },
    is_active: { type: Boolean, required: true, default: false },
    deployed_at: { type: Date, default: null },
    deployed_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updated_by: { type: Schema.Types.ObjectId, ref: "User", default: null },
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
// 임시저장 프롬프트 조회 시 사용
promptSchema.index({ status: 1 });

export const PromptModel = model<IPrompt>("Prompt", promptSchema);
