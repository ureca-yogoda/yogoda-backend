import { Schema, model, type Types } from "mongoose";

export interface IPointTransaction {
  user_id: Types.ObjectId;
  amount: number;
  reason: string;
  source_key: string;
  created_at?: Date;
}

const pointTransactionSchema = new Schema<IPointTransaction>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    source_key: { type: String, required: true },
  },
  {
    collection: "point_transactions",
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  },
);

// 같은 출석이나 미션 보상이 중복 적립되지 않도록 원천 키를 고유하게 관리함
pointTransactionSchema.index({ user_id: 1, source_key: 1 }, { unique: true });
pointTransactionSchema.index({ user_id: 1, created_at: -1 });

export const PointTransactionModel = model<IPointTransaction>(
  "PointTransaction",
  pointTransactionSchema,
);
