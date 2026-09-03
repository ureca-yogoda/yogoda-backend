import { PlanModel } from "../models/plan.model.js";
import { UserModel } from "../models/user.model.js";
import { UserSubscriptionModel } from "../models/user-subscription.model.js";
import { UserUsageSummaryModel } from "../models/user-usage-summary.model.js";
import { AppError } from "../utils/AppError.js";
import { env } from "../core/config/env.js";
import { addMySubscription } from "./subscription.service.js";
import { notifyUsagePatternChanged } from "./notification.service.js";
import {
  recommendPlanFromUsageWithAI,
  type UsageRecommendationDecision,
} from "./ai/ai.client.js";

export type DemoUsageScenario = "baseline" | "usage-drop";

export interface UsageReport {
  source: "demo";
  scenario: DemoUsageScenario;
  period: string;
  dataUsed: number;
  dataLimit: number;
  callMinutes: number;
  subscriptionCount: number;
  monthlyFee: number;
  history: Array<{ month: string; amount: number }>;
  averageUsage: number;
  recentAverage: number;
  previousAverage: number;
  changeRate: number;
  activeOttCount: number;
}

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
    // 최근 평균 34.7GB에 15% 여유를 더해도 40GB 요금제가 후보에 포함됩니다.
    { data: 40.2, calls: 241, tethering: 8.1 },
    { data: 34.1, calls: 205, tethering: 5.6 },
    { data: 29.7, calls: 181, tethering: 4.2 },
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
    .select("code name monthly_fee discount_fee data")
    .lean();
  if (!plan) throw new AppError(404, "현재 요금제를 찾을 수 없어요.");

  return { user, plan };
}

export async function getMyUsageRecommendation(userId: string) {
  const [{ plan }, report] = await Promise.all([
    getUserPlan(userId),
    getMyUsageReport(userId),
  ]);
  const currentMonthlyFee = plan.discount_fee ?? plan.monthly_fee;
  const requiredDataGb = report.recentAverage * 1.15;
  const plans = await PlanModel.find({
    is_active: true,
    _id: { $ne: plan._id },
  })
    .select("code name monthly_fee discount_fee data tags recommendation_tags")
    .lean();
  const candidates = plans
    .filter((candidate) => {
      const monthlyFee = candidate.discount_fee ?? candidate.monthly_fee;
      const amountGb =
        candidate.data.amount_mb === null
          ? null
          : candidate.data.amount_mb / 1024;
      return (
        monthlyFee < currentMonthlyFee &&
        (amountGb === null || amountGb >= requiredDataGb)
      );
    })
    .map((candidate) => ({
      code: candidate.code,
      name: candidate.name,
      monthlyFee: candidate.discount_fee ?? candidate.monthly_fee,
      dataDisplay: candidate.data.display,
      tags: [...candidate.tags, ...candidate.recommendation_tags],
    }))
    .sort((a, b) => a.monthlyFee - b.monthlyFee)
    .slice(0, 5);

  if (candidates.length === 0) {
    return {
      status: "keep-current" as const,
      headline: "현재 요금제가 가장 적합해요",
      reason:
        "최근 사용량을 안정적으로 제공하면서 더 저렴한 요금제를 찾지 못했어요.",
      currentPlan: {
        code: plan.code,
        name: plan.name,
        monthlyFee: currentMonthlyFee,
      },
      recommendedPlan: null,
      monthlySavings: 0,
      analysisSource: "rules" as const,
    };
  }

  let decision: UsageRecommendationDecision;
  let analysisSource: "ai" | "rules" = "ai";
  try {
    decision = await recommendPlanFromUsageWithAI({
      currentPlanName: plan.name,
      currentMonthlyFee,
      recentAverageGb: report.recentAverage,
      previousAverageGb: report.previousAverage,
      changeRate: report.changeRate,
      activeOttCount: report.activeOttCount,
      candidates,
    });
    if (
      !candidates.some((candidate) => candidate.code === decision.selectedCode)
    ) {
      throw new Error("AI_RECOMMENDATION_OUTSIDE_CANDIDATES");
    }
  } catch (error) {
    console.error("사용량 기반 AI 재추천 실패, 규칙 추천으로 대체:", error);
    analysisSource = "rules";
    decision = {
      selectedCode: candidates[0].code,
      headline: "달라진 사용량에 맞는 요금제예요",
      reason:
        "최근 평균 사용량에 여유를 더해도 충분하며 현재 요금제보다 월 요금이 낮아요.",
    };
  }
  const selected = candidates.find(
    (candidate) => candidate.code === decision.selectedCode,
  )!;

  return {
    status: "recommend-change" as const,
    headline: decision.headline,
    reason: decision.reason,
    currentPlan: {
      code: plan.code,
      name: plan.name,
      monthlyFee: currentMonthlyFee,
    },
    recommendedPlan: selected,
    monthlySavings: currentMonthlyFee - selected.monthlyFee,
    analysisSource,
    evidence: {
      recentAverageGb: report.recentAverage,
      previousAverageGb: report.previousAverage,
      changeRate: report.changeRate,
      activeOttCount: report.activeOttCount,
    },
  };
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
): Promise<UsageReport> {
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

  const report = await getMyUsageReport(userId, false, scenario);
  if (scenario === "usage-drop") {
    await notifyUsagePatternChanged(userId, report.period);
  }

  return report;
}

export async function getMyUsageReport(
  userId: string,
  initializeDemo = true,
  appliedScenario?: DemoUsageScenario,
): Promise<UsageReport> {
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
