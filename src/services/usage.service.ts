import { PlanModel } from "../models/plan.model.js";
import { UserModel } from "../models/user.model.js";
import { UserSubscriptionModel } from "../models/user-subscription.model.js";
import { UserUsageSummaryModel } from "../models/user-usage-summary.model.js";
import { AppError } from "../utils/AppError.js";
import { env } from "../core/config/env.js";
import { addMySubscription } from "./subscription.service.js";

export type DemoUsageScenario = "baseline" | "usage-drop";

const scenarioUsage = {
  baseline: [
    { data: 72.4, calls: 318, tethering: 14.2 },
    { data: 68.1, calls: 296, tethering: 12.8 },
    { data: 74.8, calls: 304, tethering: 15.1 },
  ],
  "usage-drop": [
    { data: 72.4, calls: 318, tethering: 14.2 },
    { data: 68.1, calls: 296, tethering: 12.8 },
    { data: 74.8, calls: 304, tethering: 15.1 },
    { data: 45.2, calls: 241, tethering: 8.1 },
    { data: 34.1, calls: 205, tethering: 5.6 },
    { data: 28.7, calls: 181, tethering: 4.2 },
  ],
} satisfies Record<
  DemoUsageScenario,
  Array<{ data: number; calls: number; tethering: number }>
>;

function getMonthOffset(offset: number) {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
  );
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function getUserPlan(userId: string) {
  const user = await UserModel.findById(userId)
    .select("current_plan_id")
    .lean();
  if (!user) throw new AppError(404, "유저를 찾을 수 없어요.");
  if (!user.current_plan_id) {
    throw new AppError(409, "현재 이용 중인 요금제가 없어요.");
  }

  const plan = await PlanModel.findById(user.current_plan_id)
    .select("name monthly_fee discount_fee data")
    .lean();
  if (!plan) throw new AppError(404, "현재 요금제를 찾을 수 없어요.");

  return { user, plan };
}

async function syncDemoSubscriptions(
  userId: string,
  scenario: DemoUsageScenario,
) {
  const startedAt = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1),
  );
  await Promise.all([
    addMySubscription(userId, {
      serviceCode: "netflix",
      serviceName: "Netflix",
      category: "ott",
      monthlyFee: 17_000,
      startedAt,
    }),
    addMySubscription(userId, {
      serviceCode: "tving",
      serviceName: "TVING",
      category: "ott",
      monthlyFee: 7_900,
      startedAt,
    }),
  ]);

  if (scenario === "usage-drop") {
    await UserSubscriptionModel.updateMany(
      { user_id: userId, service_code: { $in: ["netflix", "tving"] } },
      { $set: { status: "canceled", canceled_at: new Date() } },
    );
  }
}

export async function applyDemoUsageScenario(
  userId: string,
  scenario: DemoUsageScenario,
) {
  if (env.NODE_ENV === "production") {
    throw new AppError(404, "요청한 기능을 찾을 수 없어요.");
  }

  const { user, plan } = await getUserPlan(userId);
  const usage = scenarioUsage[scenario];
  const monthlyFee = plan.discount_fee ?? plan.monthly_fee;

  await UserUsageSummaryModel.deleteMany({ user_id: user._id });
  await UserUsageSummaryModel.bulkWrite(
    usage.map((item, index) => {
      const month = getMonthOffset(index - usage.length + 1);
      return {
        updateOne: {
          filter: { user_id: user._id, usage_month: month },
          update: {
            $set: {
              plan_id: plan._id,
              data_usage_gb: item.data,
              call_minutes: item.calls,
              tethering_usage_gb: item.tethering,
              actual_bill_amount: monthlyFee,
            },
          },
          upsert: true,
        },
      };
    }),
  );
  await syncDemoSubscriptions(userId, scenario);

  return getMyUsageReport(userId, false, scenario);
}

export async function getMyUsageReport(
  userId: string,
  initializeDemo = true,
  appliedScenario?: DemoUsageScenario,
) {
  const { plan } = await getUserPlan(userId);
  let usage = await UserUsageSummaryModel.find({ user_id: userId })
    .sort({ usage_month: -1 })
    .limit(6)
    .lean();

  if (usage.length === 0 && initializeDemo && env.NODE_ENV !== "production") {
    return applyDemoUsageScenario(userId, "baseline");
  }

  usage = usage.reverse();
  const latest = usage.at(-1);
  if (!latest) throw new AppError(404, "사용 이력이 없어요.");

  const subscriptions = await UserSubscriptionModel.find({
    user_id: userId,
    status: "active",
  })
    .select("category")
    .lean();
  const average =
    usage.reduce((sum, item) => sum + item.data_usage_gb, 0) / usage.length;
  const recent = usage.slice(-3);
  const previous = usage.slice(-6, -3);
  const recentAverage =
    recent.reduce((sum, item) => sum + item.data_usage_gb, 0) /
    Math.max(recent.length, 1);
  const previousAverage = previous.length
    ? previous.reduce((sum, item) => sum + item.data_usage_gb, 0) /
      previous.length
    : recentAverage;
  const changeRate = previousAverage
    ? Math.round(((recentAverage - previousAverage) / previousAverage) * 100)
    : 0;

  return {
    source: "demo" as const,
    scenario:
      appliedScenario ?? (usage.length >= 6 ? "usage-drop" : "baseline"),
    period: latest.usage_month,
    dataUsed: latest.data_usage_gb,
    dataLimit: plan.data.amount_mb === null ? 80 : plan.data.amount_mb / 1024,
    callMinutes: latest.call_minutes,
    subscriptionCount: subscriptions.length,
    monthlyFee: latest.actual_bill_amount,
    history: usage.map((item) => ({
      month: item.usage_month,
      amount: item.data_usage_gb,
    })),
    averageUsage: Number(average.toFixed(1)),
    recentAverage: Number(recentAverage.toFixed(1)),
    previousAverage: Number(previousAverage.toFixed(1)),
    changeRate,
    activeOttCount: subscriptions.filter((item) => item.category === "ott")
      .length,
  };
}
