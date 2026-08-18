import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { BenefitModel, IBenefit } from "../models/benefit.model.js";
import { IMission, MissionModel } from "../models/mission.model.js";
import { IDataAllowance, IPlan, PlanModel } from "../models/plan.model.js";

const checkedAt = new Date("2026-08-18T00:00:00.000+09:00");
const nergetPlanSourceUrl = "https://www.lguplus.com/nerget/plan";
const nergetBenefitSourceUrl = "https://www.lguplus.com/nerget/benefit";
const membershipSourceUrl = "https://www.lguplus.com/benefit-membership/rank-info";
const twoPlusSourceUrl = "https://www.lguplus.com/ujam/65";
const eventSourceUrl = "https://www.lguplus.com/benefit-event/ongoing";

const toDate = (value: string) => new Date(`${value}T00:00:00.000+09:00`);

const legacyUplusPlanCodes = [
    "uplus-plus-plan-130",
    "uplus-plus-plan-115",
    "uplus-plus-plan-105",
    "uplus-data-plan-max",
    "uplus-data-plan-150gb",
    "uplus-data-plan-125gb",
    "uplus-data-plan-95gb",
    "uplus-data-plan-80gb",
    "uplus-data-plan-50gb",
    "uplus-data-plan-31gb",
    "uplus-data-plan-24gb",
    "uplus-data-plan-14gb",
    "uplus-data-plan-9gb",
    "uplus-data-plan-5gb",
    "uplus-data-plan-1_5gb",
    "uplus-data-plan-750mb",
    "uplus-tablet-data-20gb",
    "uplus-tablet-data-10gb",
    "uplus-tablet-share-3gb",
    "uplus-tablet-share-500mb",
] as const;

const gbToMb = (gb: number) => gb * 1024;

const limitedData = (
    gb: number,
    throttleKbps: number | null,
): IDataAllowance => ({
    display:
        throttleKbps === null
            ? `월 ${gb}GB`
            : `월 ${gb}GB + 최대 ${formatSpeed(throttleKbps)}`,
    amountMb: gbToMb(gb),
    throttleKbps,
    sharingDisplay: null,
});

const unlimitedData = (
    sharingGb: number,
    familyDataGb: number,
): IDataAllowance => ({
    display: "데이터 완전 무제한",
    amountMb: null,
    throttleKbps: null,
    sharingDisplay: `테더링/쉐어링 ${sharingGb}GB, 참 쉬운 가족 데이터 ${familyDataGb}GB`,
});

function formatSpeed(kbps: number) {
    if (kbps >= 1000) return `${kbps / 1000}Mbps`;

    return `${kbps}Kbps`;
}

const nergetPlanSpecs = [
    {
        code: "nerget-26",
        name: "너겟26",
        monthlyFee: 26000,
        data: limitedData(6, 400),
        tags: ["너겟", "저가", "소량", "실속"],
        recommendationTags: ["저사용", "통신비절약", "와이파이중심"],
        sortOrder: 10,
    },
    {
        code: "nerget-33",
        name: "너겟33",
        monthlyFee: 33000,
        data: limitedData(12, 400),
        tags: ["너겟", "실속", "라이트"],
        recommendationTags: ["저사용", "통신비절약", "SNS"],
        sortOrder: 20,
    },
    {
        code: "nerget-36",
        name: "너겟36",
        monthlyFee: 36000,
        data: limitedData(20, 400),
        tags: ["너겟", "실속", "중간사용"],
        recommendationTags: ["중간사용", "SNS", "음악"],
        sortOrder: 30,
    },
    {
        code: "nerget-39",
        name: "너겟39",
        monthlyFee: 39000,
        data: limitedData(27, 400),
        tags: ["너겟", "중간사용", "추천"],
        recommendationTags: ["중간사용", "동영상가끔", "통신비절약"],
        sortOrder: 40,
    },
    {
        code: "nerget-43",
        name: "너겟43",
        monthlyFee: 43000,
        data: limitedData(40, 1000),
        tags: ["너겟", "데이터", "추천"],
        recommendationTags: ["동영상", "중간사용", "가성비"],
        sortOrder: 50,
    },
    {
        code: "nerget-46",
        name: "너겟46",
        monthlyFee: 46000,
        data: limitedData(81, 3000),
        tags: ["너겟", "대용량", "인기"],
        recommendationTags: ["동영상", "대용량", "가성비"],
        sortOrder: 60,
    },
    {
        code: "nerget-49",
        name: "너겟49",
        monthlyFee: 49000,
        data: limitedData(120, 5000),
        tags: ["너겟", "대용량", "추천"],
        recommendationTags: ["대용량", "영상시청", "핫스팟"],
        sortOrder: 70,
    },
    {
        code: "nerget-59",
        name: "너겟59",
        monthlyFee: 59000,
        data: unlimitedData(30, 20),
        tags: ["너겟", "무제한", "프리미엄"],
        recommendationTags: ["무제한", "영상시청", "콘텐츠"],
        sortOrder: 80,
    },
    {
        code: "nerget-65",
        name: "너겟65",
        monthlyFee: 65000,
        data: unlimitedData(50, 30),
        tags: ["너겟", "무제한", "프리미엄"],
        recommendationTags: ["무제한", "핫스팟", "콘텐츠"],
        sortOrder: 90,
    },
    {
        code: "nerget-69",
        name: "너겟69",
        monthlyFee: 69000,
        data: unlimitedData(70, 40),
        tags: ["너겟", "무제한", "인기"],
        recommendationTags: ["무제한", "핫스팟", "가족데이터", "콘텐츠"],
        sortOrder: 100,
    },
    {
        code: "nerget-75",
        name: "너겟75",
        monthlyFee: 75000,
        data: unlimitedData(100, 50),
        tags: ["너겟", "무제한", "최상위"],
        recommendationTags: ["무제한", "핫스팟", "가족데이터", "OTT"],
        sortOrder: 110,
    },
] satisfies Array<{
    code: string;
    name: string;
    monthlyFee: number;
    data: IDataAllowance;
    tags: string[];
    recommendationTags: string[];
    sortOrder: number;
}>;

const plans: IPlan[] = nergetPlanSpecs.map((plan) => ({
    code: plan.code,
    carrier: "LG_U_PLUS",
    productLine: "nerget",
    name: plan.name,
    category: plan.monthlyFee >= 59000 ? "premium" : "mobile",
    network: "5G/LTE",
    audiences: ["general", "app-first"],
    monthlyFee: plan.monthlyFee,
    discountFee: null,
    data: plan.data,
    voice: "집/이동전화 무제한",
    sms: "기본제공",
    membershipTier: null,
    perks:
        plan.monthlyFee >= 59000
            ? ["너겟 앱 전용 혜택", "데이터 완전 무제한", "콘텐츠/구독 혜택 추천"]
            : ["너겟 앱 전용 혜택", "데이터 사용량별 요금 선택"],
    tags: plan.tags,
    recommendationTags: plan.recommendationTags,
    sourceUrl: nergetPlanSourceUrl,
    sourceCheckedAt: checkedAt,
    isActive: true,
    sortOrder: plan.sortOrder,
}));

const commonBenefitFields = {
    period: { startsAt: null, endsAt: null },
    sourceCheckedAt: checkedAt,
    isActive: true,
} satisfies Pick<IBenefit, "period" | "sourceCheckedAt" | "isActive">;

const benefits: IBenefit[] = [
    {
        ...commonBenefitFields,
        code: "nerget-npay-coupon",
        title: "네이버페이 쿠폰 혜택",
        category: "payment",
        benefitType: "coupon",
        partner: "네이버페이",
        brand: "N Pay",
        summary: "너겟 요금제 가입 고객에게 제공되는 결제/쇼핑 쿠폰형 혜택",
        eligibility: "너겟 요금제 이용 고객",
        value: "네이버페이 쿠폰",
        usageLimit: "프로모션 기간 및 월별 조건에 따라 제공",
        minMembershipTier: null,
        minPlanMonthlyFee: 26000,
        recommendedPlanCodes: plans.map((plan) => plan.code),
        targetUserTags: ["쇼핑", "간편결제", "쿠폰선호"],
        recommendationWeight: 90,
        tags: ["너겟", "네이버페이", "쿠폰", "쇼핑"],
        sourceUrl: nergetBenefitSourceUrl,
        sortOrder: 10,
    },
    {
        ...commonBenefitFields,
        code: "nerget-family-data",
        title: "참 쉬운 가족 데이터",
        category: "family",
        benefitType: "data",
        partner: null,
        brand: "U+",
        summary: "무제한형 너겟 요금제에서 가족에게 나눠줄 수 있는 데이터 혜택",
        eligibility: "너겟 무제한형 요금제 이용 고객",
        value: "요금제별 가족 데이터 제공",
        usageLimit: "요금제별 제공량 상이",
        minMembershipTier: null,
        minPlanMonthlyFee: 59000,
        recommendedPlanCodes: ["nerget-59", "nerget-65", "nerget-69", "nerget-75"],
        targetUserTags: ["가족", "데이터공유", "무제한"],
        recommendationWeight: 86,
        tags: ["너겟", "가족", "데이터공유"],
        sourceUrl: nergetPlanSourceUrl,
        sortOrder: 20,
    },
    {
        ...commonBenefitFields,
        code: "nerget-tethering-sharing",
        title: "테더링/쉐어링 데이터",
        category: "device",
        benefitType: "data",
        partner: null,
        brand: "U+",
        summary: "태블릿, 노트북, 스마트기기와 함께 쓰기 좋은 테더링/쉐어링 데이터",
        eligibility: "너겟 무제한형 요금제 이용 고객",
        value: "요금제별 테더링/쉐어링 데이터 제공",
        usageLimit: "너겟59 30GB부터 너겟75 100GB까지",
        minMembershipTier: null,
        minPlanMonthlyFee: 59000,
        recommendedPlanCodes: ["nerget-59", "nerget-65", "nerget-69", "nerget-75"],
        targetUserTags: ["핫스팟", "태블릿", "노트북", "외근"],
        recommendationWeight: 84,
        tags: ["너겟", "테더링", "쉐어링", "스마트기기"],
        sourceUrl: nergetPlanSourceUrl,
        sortOrder: 30,
    },
    {
        ...commonBenefitFields,
        code: "nerget-phishing-hacking-insurance",
        title: "피싱/해킹 보험 혜택",
        category: "safety",
        benefitType: "insurance",
        partner: null,
        brand: "U+",
        summary: "금융사기와 보안 사고를 걱정하는 고객에게 추천하기 좋은 안전 혜택",
        eligibility: "너겟 요금제 또는 프로모션 조건 충족 고객",
        value: "피싱/해킹 피해 보장형 혜택",
        usageLimit: "상세 보장 조건은 프로모션 및 약관 기준",
        minMembershipTier: null,
        minPlanMonthlyFee: 26000,
        recommendedPlanCodes: plans.map((plan) => plan.code),
        targetUserTags: ["보안", "금융", "부모님", "안심"],
        recommendationWeight: 78,
        tags: ["너겟", "보안", "보험"],
        sourceUrl: nergetBenefitSourceUrl,
        sortOrder: 40,
    },
    {
        ...commonBenefitFields,
        code: "nerget-ott-pack",
        title: "OTT/콘텐츠 팩 추천",
        category: "content",
        benefitType: "bundle",
        partner: null,
        brand: "U+",
        summary: "영상 시청이 많은 고객에게 어울리는 콘텐츠형 부가 혜택",
        eligibility: "너겟 프리미엄/무제한형 고객 중심 추천",
        value: "OTT 및 콘텐츠 혜택 조합 추천",
        usageLimit: "선택 가능한 팩과 제공 조건은 시점별 상이",
        minMembershipTier: null,
        minPlanMonthlyFee: 59000,
        recommendedPlanCodes: ["nerget-59", "nerget-65", "nerget-69", "nerget-75"],
        targetUserTags: ["OTT", "영상시청", "콘텐츠", "무제한"],
        recommendationWeight: 82,
        tags: ["너겟", "OTT", "콘텐츠", "구독"],
        sourceUrl: nergetBenefitSourceUrl,
        sortOrder: 50,
    },
    {
        ...commonBenefitFields,
        code: "nerget-ai-subscription",
        title: "AI 구독 혜택 추천",
        category: "subscription",
        benefitType: "subscription",
        partner: null,
        brand: "U+",
        summary: "AI 도구와 생산성 앱을 자주 쓰는 고객에게 추천하는 구독형 혜택",
        eligibility: "너겟 프리미엄/무제한형 고객 중심 추천",
        value: "AI/생산성 구독 혜택",
        usageLimit: "프로모션 및 선택 팩 조건에 따라 제공",
        minMembershipTier: null,
        minPlanMonthlyFee: 59000,
        recommendedPlanCodes: ["nerget-59", "nerget-65", "nerget-69", "nerget-75"],
        targetUserTags: ["AI", "생산성", "학습", "업무"],
        recommendationWeight: 76,
        tags: ["너겟", "AI", "구독"],
        sourceUrl: nergetBenefitSourceUrl,
        sortOrder: 60,
    },
    {
        ...commonBenefitFields,
        code: "nerget-device-discount",
        title: "스마트기기 할인/연결 혜택",
        category: "device",
        benefitType: "device",
        partner: null,
        brand: "U+",
        summary: "워치, 태블릿, 노트북 테더링을 함께 쓰는 고객에게 맞는 기기형 혜택",
        eligibility: "스마트기기 사용 고객",
        value: "기기 연결 및 부가회선 활용 혜택",
        usageLimit: "기기/부가회선 조건별 상이",
        minMembershipTier: null,
        minPlanMonthlyFee: 46000,
        recommendedPlanCodes: ["nerget-46", "nerget-49", "nerget-59", "nerget-65", "nerget-69", "nerget-75"],
        targetUserTags: ["스마트기기", "태블릿", "워치", "핫스팟"],
        recommendationWeight: 74,
        tags: ["너겟", "스마트기기", "태블릿", "워치"],
        sourceUrl: nergetBenefitSourceUrl,
        sortOrder: 70,
    },
    {
        ...commonBenefitFields,
        code: "uplus-two-plus",
        title: "유플투쁠",
        category: "membership",
        benefitType: "coupon",
        partner: null,
        brand: "U+ 멤버십",
        summary: "매월 다양한 제휴 브랜드 쿠폰을 받을 수 있는 U+ 멤버십 혜택",
        eligibility: "U+ 모바일 멤버십 고객",
        value: "외식, 문화, 쇼핑 쿠폰 제공",
        usageLimit: "월별 제공 쿠폰 상이",
        minMembershipTier: null,
        minPlanMonthlyFee: null,
        recommendedPlanCodes: [],
        targetUserTags: ["쿠폰선호", "외식", "문화", "쇼핑"],
        recommendationWeight: 72,
        tags: ["멤버십", "쿠폰", "유플투쁠"],
        sourceUrl: twoPlusSourceUrl,
        sortOrder: 80,
    },
    {
        ...commonBenefitFields,
        code: "uplus-cgv-benefit",
        title: "CGV 영화 혜택",
        category: "partner",
        benefitType: "coupon",
        partner: "CGV",
        brand: "CGV",
        summary: "영화 예매 및 매점 이용 고객에게 추천하기 좋은 문화 혜택",
        eligibility: "U+ 멤버십 고객",
        value: "영화/매점 쿠폰 또는 할인",
        usageLimit: "월별 쿠폰 조건에 따라 제공",
        minMembershipTier: null,
        minPlanMonthlyFee: null,
        recommendedPlanCodes: [],
        targetUserTags: ["영화", "데이트", "문화생활"],
        recommendationWeight: 70,
        tags: ["문화", "영화", "제휴", "쿠폰"],
        sourceUrl: twoPlusSourceUrl,
        sortOrder: 90,
    },
    {
        ...commonBenefitFields,
        code: "uplus-baemin-benefit",
        title: "배달의민족 쿠폰 혜택",
        category: "partner",
        benefitType: "coupon",
        partner: "배달의민족",
        brand: "배달의민족",
        summary: "배달 주문이 잦은 고객에게 추천하기 좋은 생활 쿠폰 혜택",
        eligibility: "U+ 멤버십 고객",
        value: "배달 주문 쿠폰 또는 할인",
        usageLimit: "월별 쿠폰 조건에 따라 제공",
        minMembershipTier: null,
        minPlanMonthlyFee: null,
        recommendedPlanCodes: [],
        targetUserTags: ["배달", "자취", "외식", "쿠폰선호"],
        recommendationWeight: 70,
        tags: ["배달", "쿠폰", "제휴"],
        sourceUrl: twoPlusSourceUrl,
        sortOrder: 100,
    },
    {
        ...commonBenefitFields,
        code: "uplus-oliveyoung-benefit",
        title: "올리브영 쇼핑 혜택",
        category: "partner",
        benefitType: "coupon",
        partner: "올리브영",
        brand: "올리브영",
        summary: "뷰티/생활 상품 구매가 많은 고객에게 추천하는 쇼핑 혜택",
        eligibility: "U+ 멤버십 고객",
        value: "쇼핑 쿠폰 또는 할인",
        usageLimit: "월별 쿠폰 조건에 따라 제공",
        minMembershipTier: null,
        minPlanMonthlyFee: null,
        recommendedPlanCodes: [],
        targetUserTags: ["쇼핑", "뷰티", "생활용품", "쿠폰선호"],
        recommendationWeight: 68,
        tags: ["쇼핑", "뷰티", "제휴", "쿠폰"],
        sourceUrl: twoPlusSourceUrl,
        sortOrder: 110,
    },
    {
        ...commonBenefitFields,
        code: "uplus-starbucks-benefit",
        title: "스타벅스 카페 혜택",
        category: "partner",
        benefitType: "coupon",
        partner: "스타벅스",
        brand: "스타벅스",
        summary: "카페 이용이 잦은 고객에게 추천하기 좋은 제휴 혜택",
        eligibility: "U+ 멤버십 고객",
        value: "음료 쿠폰 또는 할인",
        usageLimit: "월별 쿠폰 조건에 따라 제공",
        minMembershipTier: null,
        minPlanMonthlyFee: null,
        recommendedPlanCodes: [],
        targetUserTags: ["카페", "커피", "출근", "쿠폰선호"],
        recommendationWeight: 68,
        tags: ["카페", "커피", "제휴", "쿠폰"],
        sourceUrl: twoPlusSourceUrl,
        sortOrder: 120,
    },
    {
        ...commonBenefitFields,
        code: "uplus-choice-discount",
        title: "선택약정 할인",
        category: "discount",
        benefitType: "discount",
        partner: null,
        brand: "U+",
        summary: "단말 지원금 대신 월 통신요금을 할인받는 약정 할인",
        eligibility: "선택약정 가입 가능 회선",
        value: "월정액 기준 할인",
        usageLimit: "약정 조건에 따라 제공",
        minMembershipTier: null,
        minPlanMonthlyFee: null,
        recommendedPlanCodes: plans.map((plan) => plan.code),
        targetUserTags: ["통신비절약", "약정", "가성비"],
        recommendationWeight: 88,
        tags: ["요금할인", "약정", "절약"],
        sourceUrl: nergetPlanSourceUrl,
        sortOrder: 130,
    },
];

const missions: IMission[] = [
    {
        code: "mission-ai-nerget-diagnosis",
        title: "AI 너겟 요금제 진단",
        category: "subscription",
        summary: "최근 데이터 사용량과 선호 혜택을 기준으로 맞는 너겟 요금제를 찾는 미션",
        requirement: "AI 진단 시작",
        reward: "추천 요금제와 예상 절감액 확인",
        period: { startsAt: null, endsAt: null },
        status: "active",
        tags: ["AI", "너겟", "요금제", "절감"],
        targetUserTags: ["요금제추천", "통신비절약", "AI"],
        recommendationWeight: 95,
        sourceUrl: nergetPlanSourceUrl,
        sourceCheckedAt: checkedAt,
        isActive: true,
        sortOrder: 10,
    },
    {
        code: "mission-nerget-plan-compare",
        title: "너겟 요금제 비교하기",
        category: "subscription",
        summary: "너겟 11개 요금제를 데이터 사용량과 가격 기준으로 비교하는 미션",
        requirement: "요금제 비교 화면 확인",
        reward: "내 사용량에 맞는 요금제 후보 확인",
        period: { startsAt: null, endsAt: null },
        status: "active",
        tags: ["너겟", "요금제", "비교"],
        targetUserTags: ["요금제추천", "가성비", "데이터"],
        recommendationWeight: 90,
        sourceUrl: nergetPlanSourceUrl,
        sourceCheckedAt: checkedAt,
        isActive: true,
        sortOrder: 20,
    },
    {
        code: "mission-benefit-preference",
        title: "관심 혜택 고르기",
        category: "profile",
        summary: "영화, 배달, 쇼핑, OTT 등 관심 혜택을 저장해 추천 정확도를 높이는 미션",
        requirement: "관심 혜택 3개 이상 선택",
        reward: "개인화 혜택 추천 강화",
        period: { startsAt: null, endsAt: null },
        status: "active",
        tags: ["혜택", "개인화", "추천"],
        targetUserTags: ["쿠폰선호", "개인화", "혜택추천"],
        recommendationWeight: 86,
        sourceUrl: twoPlusSourceUrl,
        sourceCheckedAt: checkedAt,
        isActive: true,
        sortOrder: 30,
    },
    {
        code: "mission-uplus-one-attendance",
        title: "U+one 앱 출석체크",
        category: "attendance",
        summary: "U+one 앱에서 매일 출석하고 이벤트 보상을 확인하는 미션",
        requirement: "U+one 앱 접속 후 출석체크 완료",
        reward: "이벤트 포인트 또는 경품 응모 기회",
        period: { startsAt: null, endsAt: null },
        status: "active",
        tags: ["출석", "앱", "이벤트"],
        targetUserTags: ["출석", "이벤트", "포인트"],
        recommendationWeight: 74,
        sourceUrl: eventSourceUrl,
        sourceCheckedAt: checkedAt,
        isActive: true,
        sortOrder: 40,
    },
    {
        code: "mission-two-plus-coupon",
        title: "유플투쁠 쿠폰 받기",
        category: "event",
        summary: "이번 달 유플투쁠 쿠폰을 확인하고 관심 혜택을 받는 미션",
        requirement: "유플투쁠 혜택 페이지에서 쿠폰 확인",
        reward: "제휴 쿠폰",
        period: { startsAt: null, endsAt: null },
        status: "active",
        tags: ["유플투쁠", "쿠폰", "혜택"],
        targetUserTags: ["쿠폰선호", "외식", "쇼핑"],
        recommendationWeight: 78,
        sourceUrl: twoPlusSourceUrl,
        sourceCheckedAt: checkedAt,
        isActive: true,
        sortOrder: 50,
    },
    {
        code: "mission-security-benefit-check",
        title: "안심 혜택 확인",
        category: "profile",
        summary: "피싱/해킹 보험처럼 보안 성향 고객에게 맞는 혜택을 확인하는 미션",
        requirement: "안심 혜택 상세 확인",
        reward: "보안형 혜택 추천",
        period: { startsAt: null, endsAt: null },
        status: "active",
        tags: ["보안", "안심", "혜택"],
        targetUserTags: ["보안", "부모님", "금융"],
        recommendationWeight: 68,
        sourceUrl: nergetBenefitSourceUrl,
        sourceCheckedAt: checkedAt,
        isActive: true,
        sortOrder: 60,
    },
    {
        code: "mission-august-event-check",
        title: "이번 달 이벤트 확인",
        category: "event",
        summary: "진행 중인 U+ 이벤트를 확인하고 참여 가능한 이벤트를 찾는 미션",
        requirement: "진행 중 이벤트 목록 확인",
        reward: "이벤트 응모 기회",
        period: {
            startsAt: toDate("2026-08-01"),
            endsAt: toDate("2026-08-31"),
        },
        status: "active",
        tags: ["이벤트", "8월", "응모"],
        targetUserTags: ["이벤트", "경품", "응모"],
        recommendationWeight: 64,
        sourceUrl: eventSourceUrl,
        sourceCheckedAt: checkedAt,
        isActive: true,
        sortOrder: 70,
    },
];

async function deactivateLegacyPlans() {
    const result = await PlanModel.updateMany(
        { carrier: "LG_U_PLUS", code: { $in: legacyUplusPlanCodes } },
        { $set: { isActive: false, productLine: "uplus" } },
    );

    console.log(`✅ legacy plans ${result.modifiedCount}건 비활성 처리 완료`);
}

async function upsertPlans() {
    for (const plan of plans) {
        await PlanModel.updateOne(
            { carrier: plan.carrier, code: plan.code },
            { $set: plan },
            { upsert: true },
        );
    }

    console.log(`✅ nerget plans ${plans.length}건 upsert 완료`);
}

async function upsertBenefits() {
    for (const benefit of benefits) {
        await BenefitModel.updateOne(
            { code: benefit.code },
            { $set: benefit },
            { upsert: true },
        );
    }

    console.log(`✅ benefits ${benefits.length}건 upsert 완료`);
}

async function upsertMissions() {
    for (const mission of missions) {
        await MissionModel.updateOne(
            { code: mission.code },
            { $set: mission },
            { upsert: true },
        );
    }

    console.log(`✅ missions ${missions.length}건 upsert 완료`);
}

async function seedUplusData() {
    /*
     * 운영 DB에 넣는 초기 데이터라 삭제 없이 upsert만 수행함
     * 이전 일반 U+ seed 요금제는 추천 대상에서 빠지도록 비활성 처리함
     */
    await loadSecrets();
    assertRequiredEnv();
    await connectDB();

    await deactivateLegacyPlans();
    await upsertPlans();
    await upsertBenefits();
    await upsertMissions();

    await mongoose.connection.close();
    console.log("✅ 너겟 중심 U+ seed 완료");
}

seedUplusData().catch(async (error: unknown) => {
    console.error("❌ U+ seed 실패:", error);
    await mongoose.connection.close();
    process.exit(1);
});
