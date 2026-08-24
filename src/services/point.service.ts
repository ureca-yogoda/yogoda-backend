import { Types } from "mongoose";

import { PointTransactionModel } from "../models/point-transaction.model.js";

export async function addPoints(
  userId: string,
  amount: number,
  reason: string,
  sourceKey: string,
) {
  return PointTransactionModel.findOneAndUpdate(
    { user_id: userId, source_key: sourceKey },
    { $setOnInsert: { amount, reason } },
    { new: true, upsert: true },
  );
}

export async function getPointWallet(userId: string) {
  const [summary] = await PointTransactionModel.aggregate<{ balance: number }>([
    { $match: { user_id: new Types.ObjectId(userId) } },
    { $group: { _id: null, balance: { $sum: "$amount" } } },
  ]);
  const history = await PointTransactionModel.find({ user_id: userId })
    .sort({ created_at: -1 })
    .limit(30)
    .lean();

  return {
    balance: summary?.balance ?? 0,
    history: history.map((item) => ({
      id: item._id.toString(),
      amount: item.amount,
      reason: item.reason,
      sourceKey: item.source_key,
      createdAt: item.created_at,
    })),
  };
}
