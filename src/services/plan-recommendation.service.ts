import { PlanModel } from "../models/plan.model.js";
import type { ChatRecommendation, PlanCandidate } from "../types/chat.js";

export interface PlanCard {
  code: string;
  badge: string;
  name: string;
  price: string;
  specs: string;
  savings: string;
  matchRate: string;
}

/**
 * AI 프롬프트에 넣을 요금제 후보 목록을 가져옵니다.
 * 프롬프트 크기를 줄이기 위해 추천 판단에 필요한 필드만 추립니다.
 * 로그인한 사용자가 이미 이용 중인 요금제가 있다면(excludePlanCode) 후보에서 제외해
 * AI가 지금 쓰고 있는 요금제를 다시 추천하지 않도록 합니다.
 */
export async function getPlanCandidates(
  excludePlanCode?: string | null,
): Promise<PlanCandidate[]> {
  const plans = await PlanModel.find({
    is_active: true,
    ...(excludePlanCode ? { code: { $ne: excludePlanCode } } : {}),
  })
    .select(
      "code name category monthly_fee discount_fee data voice sms membership_tier perks tags recommendation_tags",
    )
    .sort({ sort_order: 1, monthly_fee: 1 })
    .lean();

  return plans.map((p) => ({
    code: p.code,
    name: p.name,
    category: p.category,
    monthly_fee: p.monthly_fee,
    discount_fee: p.discount_fee ?? null,
    dataDisplay: p.data?.display ?? "정보 없음",
    voice: p.voice,
    sms: p.sms,
    membership_tier: p.membership_tier ?? null,
    perks: p.perks ?? [],
    tags: p.tags ?? [],
    recommendation_tags: p.recommendation_tags ?? [],
  }));
}

/**
 * AI가 고른 code/matchRate/reason과 실제 DB 요금제 데이터를 결합해서 프론트 카드 형식으로 변환합니다.
 * 이름/가격/사양은 항상 DB 값을 사용하고, AI가 후보 목록에 없는 code를 만들어냈다면 걸러냅니다.
 */
export function buildPlanCards(
  recommendations: ChatRecommendation[],
  candidates: PlanCandidate[],
): PlanCard[] {
  const candidateMap = new Map(candidates.map((c) => [c.code, c]));

  return recommendations
    .map((rec, idx) => {
      const plan = candidateMap.get(rec.code);
      if (!plan) return null;

      const fee = plan.discount_fee ?? plan.monthly_fee;
      const matchRate = Math.round(Math.min(100, Math.max(0, rec.matchRate)));

      return {
        code: plan.code,
        badge: `Best ${idx + 1}`,
        name: plan.name,
        price: `월 ${fee.toLocaleString()}원`,
        specs: `${plan.dataDisplay} · ${plan.voice}`,
        savings: rec.reason,
        matchRate: `${matchRate}% 일치`,
      };
    })
    .filter((card): card is PlanCard => card !== null)
    .slice(0, 3);
}
