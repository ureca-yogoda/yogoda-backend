import { isValidObjectId } from "mongoose";

import {
  type SubscriptionCategory,
  type SubscriptionStatus,
  UserSubscriptionModel,
} from "../models/user-subscription.model.js";
import { AppError } from "../utils/AppError.js";

export interface SubscriptionInput {
  serviceCode: string;
  serviceName: string;
  category: SubscriptionCategory;
  monthlyFee: number;
  startedAt: Date;
}

export interface SubscriptionUpdate {
  monthlyFee?: number;
  status?: SubscriptionStatus;
  startedAt?: Date;
}

interface SubscriptionSource {
  _id: { toString(): string };
  service_code: string;
  service_name: string;
  category: SubscriptionCategory;
  monthly_fee: number;
  status: SubscriptionStatus;
  started_at: Date;
  canceled_at: Date | null;
  updated_at: Date;
}

function serializeSubscription(subscription: SubscriptionSource) {
  return {
    id: subscription._id.toString(),
    serviceCode: subscription.service_code,
    serviceName: subscription.service_name,
    category: subscription.category,
    monthlyFee: subscription.monthly_fee,
    status: subscription.status,
    startedAt: subscription.started_at,
    canceledAt: subscription.canceled_at,
    updatedAt: subscription.updated_at,
  };
}

export async function getMySubscriptions(userId: string) {
  const documents = await UserSubscriptionModel.find({ user_id: userId })
    .sort({ status: 1, updated_at: -1 })
    .lean();
  const subscriptions = documents.map(serializeSubscription);
  const active = subscriptions.filter((item) => item.status === "active");

  return {
    summary: {
      activeCount: active.length,
      monthlyTotal: active.reduce((sum, item) => sum + item.monthlyFee, 0),
    },
    subscriptions,
  };
}

export async function addMySubscription(
  userId: string,
  input: SubscriptionInput,
) {
  const subscription = await UserSubscriptionModel.findOneAndUpdate(
    { user_id: userId, service_code: input.serviceCode },
    {
      $set: {
        service_name: input.serviceName,
        category: input.category,
        monthly_fee: input.monthlyFee,
        status: "active",
        started_at: input.startedAt,
        canceled_at: null,
      },
      $setOnInsert: { user_id: userId, service_code: input.serviceCode },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean();

  if (!subscription) {
    throw new AppError(500, "구독 정보를 저장하지 못했어요.");
  }

  return serializeSubscription(subscription);
}

export async function updateMySubscription(
  userId: string,
  subscriptionId: string,
  update: SubscriptionUpdate,
) {
  if (!isValidObjectId(subscriptionId)) {
    throw new AppError(400, "잘못된 구독 ID예요.");
  }

  const set: Record<string, unknown> = {};
  if (update.monthlyFee !== undefined) set.monthly_fee = update.monthlyFee;
  if (update.startedAt !== undefined) set.started_at = update.startedAt;
  if (update.status !== undefined) {
    set.status = update.status;
    set.canceled_at = update.status === "canceled" ? new Date() : null;
  }

  const subscription = await UserSubscriptionModel.findOneAndUpdate(
    { _id: subscriptionId, user_id: userId },
    { $set: set },
    { new: true, runValidators: true },
  ).lean();

  if (!subscription) {
    throw new AppError(404, "구독 정보를 찾을 수 없어요.");
  }

  return serializeSubscription(subscription);
}

export function cancelMySubscription(userId: string, subscriptionId: string) {
  return updateMySubscription(userId, subscriptionId, {
    status: "canceled",
  });
}
