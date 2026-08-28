import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { BenefitModel, IBenefit } from "../models/benefit.model.js";
import { IMission, MissionModel } from "../models/mission.model.js";
import {
  IDataAllowance,
  IPlan,
  IPlanChoiceBenefitOption,
  PlanModel,
} from "../models/plan.model.js";

const checkedAt = new Date("2026-08-19T00:00:00.000+09:00");
const nergetPlanSourceUrl = "https://www.lguplus.com/nerget/plan";
const nergetBenefitSourceUrl = "https://www.lguplus.com/nerget/benefit";
const membershipSourceUrl =
  "https://www.lguplus.com/benefit-membership/rank-info";
const twoPlusSourceUrl = "https://www.lguplus.com/ujam/65";
const eventSourceUrl = "https://www.lguplus.com/benefit-event/ongoing";

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

function formatSpeed(kbps: number) {
  if (kbps >= 1000) return `${kbps / 1000}Mbps`;

  return `${kbps}Kbps`;
}

const limitedData = (
  gb: number,
  throttle_kbps: number,
  sharing_display: string,
): IDataAllowance => ({
  display: `월 ${gb}GB + 최대 ${formatSpeed(throttle_kbps)}`,
  amount_mb: gbToMb(gb),
  throttle_kbps,
  sharing_display,
  family_data_display: null,
});

const unlimitedData = (
  sharingGb: number,
  familyDataGb: number | null = null,
): IDataAllowance => ({
  display: "데이터 완전 무제한",
  amount_mb: null,
  throttle_kbps: null,
  sharing_display: `테더링/쉐어링 ${sharingGb}GB`,
  family_data_display:
    familyDataGb === null ? null : `참 쉬운 가족 데이터 ${familyDataGb}GB`,
});

const nergetPlanSpecs = [
  {
    code: "nerget-26",
    name: "너겟26",
    monthly_fee: 26000,
    data: limitedData(6, 400, "테더링/쉐어링 기본 제공량 내 이용"),
    promotion: {
      badge: null,
      effective_monthly_fee: 21600,
      max_monthly_benefit: 4400,
    },
    is_popular: true,
    popular_order: 6,
    tags: ["너겟", "저가", "소량", "실속", "인기"],
    recommendation_tags: ["저사용", "통신비절약", "와이파이중심"],
    sort_order: 10,
  },
  {
    code: "nerget-33",
    name: "너겟33",
    monthly_fee: 33000,
    data: limitedData(12, 400, "테더링/쉐어링 기본 제공량 내 이용"),
    promotion: {
      badge: null,
      effective_monthly_fee: null,
      max_monthly_benefit: null,
    },
    is_popular: false,
    popular_order: null,
    tags: ["너겟", "실속", "라이트"],
    recommendation_tags: ["저사용", "통신비절약", "SNS"],
    sort_order: 20,
  },
  {
    code: "nerget-36",
    name: "너겟36",
    monthly_fee: 36000,
    data: limitedData(20, 1000, "테더링/쉐어링 기본 제공량 내 이용"),
    promotion: {
      badge: null,
      effective_monthly_fee: null,
      max_monthly_benefit: null,
    },
    is_popular: false,
    popular_order: null,
    tags: ["너겟", "실속", "중간사용"],
    recommendation_tags: ["중간사용", "SNS", "음악"],
    sort_order: 30,
  },
  {
    code: "nerget-39",
    name: "너겟39",
    monthly_fee: 39000,
    data: limitedData(27, 1000, "테더링/쉐어링 기본 제공량 내 이용"),
    promotion: {
      badge: null,
      effective_monthly_fee: null,
      max_monthly_benefit: null,
    },
    is_popular: false,
    popular_order: null,
    tags: ["너겟", "중간사용"],
    recommendation_tags: ["중간사용", "동영상가끔", "통신비절약"],
    sort_order: 40,
  },
  {
    code: "nerget-43",
    name: "너겟43",
    monthly_fee: 43000,
    data: limitedData(40, 1000, "테더링/쉐어링 기본 제공량 내 이용"),
    promotion: {
      badge: null,
      effective_monthly_fee: null,
      max_monthly_benefit: null,
    },
    is_popular: false,
    popular_order: null,
    tags: ["너겟", "데이터"],
    recommendation_tags: ["동영상", "중간사용", "가성비"],
    sort_order: 50,
  },
  {
    code: "nerget-46",
    name: "너겟46",
    monthly_fee: 46000,
    data: limitedData(81, 3000, "테더링/쉐어링 기본 제공량 내 50GB"),
    promotion: {
      badge: null,
      effective_monthly_fee: null,
      max_monthly_benefit: null,
    },
    is_popular: false,
    popular_order: null,
    tags: ["너겟", "대용량"],
    recommendation_tags: ["동영상", "대용량", "가성비"],
    sort_order: 60,
  },
  {
    code: "nerget-49",
    name: "너겟49",
    monthly_fee: 49000,
    data: limitedData(120, 5000, "테더링/쉐어링 기본 제공량 내 60GB"),
    promotion: {
      badge: "Npay 24만원",
      effective_monthly_fee: 24600,
      max_monthly_benefit: 24400,
    },
    is_popular: true,
    popular_order: 2,
    tags: ["너겟", "대용량", "인기"],
    recommendation_tags: ["대용량", "영상시청", "핫스팟"],
    sort_order: 70,
  },
  {
    code: "nerget-59",
    name: "너겟59",
    monthly_fee: 59000,
    data: unlimitedData(70),
    promotion: {
      badge: "Npay 24만원",
      effective_monthly_fee: 3700,
      max_monthly_benefit: 55300,
    },
    is_popular: true,
    popular_order: 3,
    tags: ["너겟", "무제한", "프리미엄", "인기"],
    recommendation_tags: ["무제한", "영상시청", "콘텐츠"],
    sort_order: 80,
  },
  {
    code: "nerget-65",
    name: "너겟65",
    monthly_fee: 65000,
    data: unlimitedData(80),
    promotion: {
      badge: "너겟쿠폰 34.8만원",
      effective_monthly_fee: -1200,
      max_monthly_benefit: 66200,
    },
    is_popular: true,
    popular_order: 4,
    tags: ["너겟", "무제한", "프리미엄", "인기"],
    recommendation_tags: ["무제한", "핫스팟", "콘텐츠"],
    sort_order: 90,
  },
  {
    code: "nerget-69",
    name: "너겟69",
    monthly_fee: 69000,
    data: unlimitedData(100),
    promotion: {
      badge: "너겟쿠폰 34.8만원",
      effective_monthly_fee: -22300,
      max_monthly_benefit: 91300,
    },
    is_popular: true,
    popular_order: 5,
    tags: ["너겟", "무제한", "프리미엄", "인기"],
    recommendation_tags: ["무제한", "핫스팟", "가족데이터", "콘텐츠"],
    sort_order: 100,
  },
  {
    code: "nerget-75",
    name: "너겟75",
    monthly_fee: 75000,
    data: unlimitedData(100, 50),
    promotion: {
      badge: "Npay 18만원",
      effective_monthly_fee: 1400,
      max_monthly_benefit: 73600,
    },
    is_popular: true,
    popular_order: 1,
    tags: ["너겟", "무제한", "최상위", "인기"],
    recommendation_tags: ["무제한", "핫스팟", "가족데이터", "OTT"],
    sort_order: 110,
  },
] satisfies Array<{
  code: string;
  name: string;
  monthly_fee: number;
  data: IDataAllowance;
  promotion: {
    badge: string | null;
    effective_monthly_fee: number | null;
    max_monthly_benefit: number | null;
  };
  is_popular: boolean;
  popular_order: number | null;
  tags: string[];
  recommendation_tags: string[];
  sort_order: number;
}>;

const choiceOption = (
  code: string,
  title: string,
  description: string | null = null,
  monthly_value: number | null = null,
  brand: string | null = null,
): IPlanChoiceBenefitOption => ({
  code,
  title,
  description,
  brand,
  image_url: null,
  monthly_value,
});

const premiumPlus59: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "google-one",
    "구글원",
    "구글 AI 프로 등 U+ 요금제 전용 구글원 혜택",
    19000,
    "Google",
  ),
  choiceOption(
    "ai-subscription",
    "AI구독",
    "AI·생산성 구독 서비스를 이용할 수 있는 혜택",
    23900,
    "U+",
  ),
  choiceOption("mania-device", "마니아디바이스", null, null, "U+"),
  choiceOption("samsung-device", "삼성디바이스", null, null, "Samsung"),
  choiceOption("apple-device", "애플디바이스", null, null, "Apple"),
  choiceOption("netflix", "넷플릭스", null, null, "Netflix"),
  choiceOption("daily", "데일리", "데일리플러스 4개 중 1개 선택", null, "U+"),
  choiceOption(
    "nerget-all-in-one",
    "너겟 올인원",
    "너겟 인터넷과 함께 이용하는 결합형 혜택",
    19800,
    "U+",
  ),
  choiceOption("soho-nerget-all-in-one", "소호 너겟 올인원", null, null, "U+"),
];

const premiumPlus65: IPlanChoiceBenefitOption[] = [
  choiceOption("google-one", "구글원", null, 29000, "Google"),
  choiceOption("ai-subscription", "AI구독", null, 52900, "U+"),
  choiceOption("mania-device", "마니아디바이스", null, 22040, "U+"),
  choiceOption("samsung-device", "삼성디바이스", null, 14580, "Samsung"),
  choiceOption("apple-device", "애플디바이스", null, 14360, "Apple"),
  choiceOption("disney-tving", "디즈니+티빙", null, 19400, "Disney+ · TVING"),
  choiceOption("netflix", "넷플릭스", null, 13500, "Netflix"),
  choiceOption("daily", "데일리", "데일리플러스 4개 중 2개 선택", null, "U+"),
  choiceOption("action-cam", "액션캠", null, 18700, "U+"),
  choiceOption("emart24", "이마트24", null, 36000, "이마트24"),
  choiceOption("toss", "토스", null, null, "Toss"),
  choiceOption(
    "nerget-all-in-one",
    "너겟 올인원",
    "너겟 인터넷과 함께 이용하는 결합형 혜택",
    26400,
    "U+",
  ),
  choiceOption("soho-nerget-all-in-one", "소호 너겟 올인원", null, 24200, "U+"),
];

const premiumPlus69: IPlanChoiceBenefitOption[] = [
  choiceOption("google-one", "구글원", null, 29000, "Google"),
  choiceOption("ai-subscription", "AI구독", null, 52900, "U+"),
  choiceOption("mania-device", "마니아디바이스", null, 22040, "U+"),
  choiceOption("samsung-device", "삼성디바이스", null, 14580, "Samsung"),
  choiceOption("apple-device", "애플디바이스", null, 14360, "Apple"),
  choiceOption("disney-tving", "디즈니+티빙", null, 19400, "Disney+ · TVING"),
  choiceOption("netflix", "넷플릭스", null, 17000, "Netflix"),
  choiceOption("daily", "데일리", "데일리플러스 4개 중 3개 선택", null, "U+"),
  choiceOption("action-cam", "액션캠", null, 18700, "U+"),
  choiceOption("emart24", "이마트24", null, 36000, "이마트24"),
  choiceOption(
    "nerget-all-in-one",
    "너겟 올인원",
    "너겟 인터넷과 함께 이용하는 결합형 혜택",
    26400,
    "U+",
  ),
  choiceOption("soho-nerget-all-in-one", "소호 너겟 올인원", null, 24200, "U+"),
];

const premiumPlus69NonDailyCodes = premiumPlus69
  .filter((option) => option.code !== "daily")
  .map((option) => option.code);

const dailyPlus: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "google-one",
    "구글원",
    "U+ 요금제 전용 구글원 이용권의 월정액 할인",
    null,
    "Google",
  ),
  choiceOption(
    "millie",
    "밀리의 서재",
    "무제한 독서 플랫폼 서비스",
    11900,
    "밀리의 서재",
  ),
  choiceOption(
    "genie-music",
    "지니뮤직",
    "지니뮤직 앱 음악감상",
    7900,
    "지니뮤직",
  ),
  choiceOption("moazine", "모아진", "무제한 매거진 서비스", 15000, "모아진"),
];

const samsungDevice59: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "galaxy-watch9-40mm",
    "갤럭시워치9 40mm",
    "할부금 100% 할인",
    null,
    "Samsung",
  ),
  choiceOption(
    "galaxy-watch8-40mm",
    "갤럭시워치8 40mm",
    "할부금 100% 할인",
    null,
    "Samsung",
  ),
  choiceOption(
    "galaxy-buds3-pro",
    "갤럭시버즈3프로",
    "할부금 100% 할인",
    null,
    "Samsung",
  ),
  choiceOption(
    "galaxy-buds4",
    "갤럭시버즈4",
    "할부금 100% 할인",
    null,
    "Samsung",
  ),
];

const samsungDevice65And69: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "galaxy-watch9-40mm",
    "갤럭시워치9 40mm",
    "할부금 100% 할인",
    null,
    "Samsung",
  ),
  choiceOption(
    "galaxy-watch8-40mm",
    "갤럭시워치8 40mm",
    "할부금 100% 할인",
    null,
    "Samsung",
  ),
  choiceOption(
    "galaxy-buds3-pro",
    "갤럭시버즈3프로",
    "할부금 100% 할인",
    null,
    "Samsung",
  ),
];

const appleDevice59: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "airpods-max2",
    "에어팟 맥스2",
    "할부금 100% 할인",
    null,
    "Apple",
  ),
  choiceOption(
    "apple-watch-se3-44mm",
    "애플워치SE3 44mm",
    "할부금 100% 할인",
    null,
    "Apple",
  ),
];

const appleDevice65And69: IPlanChoiceBenefitOption[] = [
  ...appleDevice59,
  choiceOption(
    "airpods4-anc",
    "에어팟4(ANC)",
    "할부금 100% 할인",
    null,
    "Apple",
  ),
];

const maniaDevice: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "rayban-meta-wayfarer-matte-black",
    "레이밴 메타 웨이페어러 매트블랙",
    "Meta AI를 결합한 스마트 안경",
    null,
    "Ray-Ban Meta",
  ),
  choiceOption(
    "rayban-meta-wayfarer-shiny-black",
    "레이밴 메타 웨이페어러 샤이니블랙",
    "Meta AI를 결합한 스마트 안경",
    null,
    "Ray-Ban Meta",
  ),
  choiceOption(
    "rayban-meta-wayfarer-large-matte-black",
    "레이밴 메타 웨이페어러 라지 매트블랙",
    "Meta AI를 결합한 스마트 안경",
    null,
    "Ray-Ban Meta",
  ),
  choiceOption(
    "garmin-forerunner-265",
    "가민 포러너 265",
    "GPS 러닝 스마트워치",
    null,
    "Garmin",
  ),
];

const netflix59: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "netflix-ads-standard",
    "넷플릭스 광고형 스탠다드",
    "너겟59에서 추가 과금 없이 이용",
    7000,
    "Netflix",
  ),
  choiceOption(
    "netflix-standard",
    "넷플릭스 스탠다드",
    "너겟59에서 월 6,500원 추가 과금",
    13500,
    "Netflix",
  ),
  choiceOption(
    "netflix-premium",
    "넷플릭스 프리미엄",
    "너겟59에서 월 10,000원 추가 과금",
    17000,
    "Netflix",
  ),
];

const netflix65: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "netflix-standard",
    "넷플릭스 스탠다드",
    "너겟65에서 추가 과금 없이 이용",
    13500,
    "Netflix",
  ),
  choiceOption(
    "netflix-premium",
    "넷플릭스 프리미엄",
    "너겟65에서 월 3,500원 추가 과금",
    17000,
    "Netflix",
  ),
];

const netflix69: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "netflix-premium",
    "넷플릭스 프리미엄",
    "너겟69에서 추가 과금 없이 이용",
    17000,
    "Netflix",
  ),
];

const nergetCouponOptions: IPlanChoiceBenefitOption[] = [
  choiceOption("daiso", "다이소 상품권", null, null, "다이소"),
  choiceOption("naver-pay", "네이버페이", null, null, "N Pay"),
  choiceOption("melon", "멜론 무제한 듣기", null, null, "Melon"),
  choiceOption("gs-discount", "GS 할인쿠폰(주유·편의점)", null, null, "GS"),
  choiceOption("happycon", "해피콘 상품권", null, null, "해피콘"),
  choiceOption("accessory-mall", "액세서리몰 쿠폰", null, null, "U+"),
];

const vipPassInfo: IPlanChoiceBenefitOption[] = [
  choiceOption(
    "uplus-vip-pick",
    "U+ 멤버십 VIP콕",
    "110여 개 제휴사에서 VIP 할인을 받고 매달 1번, 24개월 동안 VIP콕 혜택을 이용할 수 있어요.",
    null,
    "U+",
  ),
];

const planDetailOverrides: Partial<
  Record<
    string,
    Pick<
      IPlan,
      | "membership_tier"
      | "smart_device_benefit"
      | "benefit_details"
      | "choice_benefits"
    >
  >
> = {
  "nerget-26": {
    membership_tier: null,
    smart_device_benefit: null,
    benefit_details: [
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 4400,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [],
  },
  "nerget-33": {
    membership_tier: null,
    smart_device_benefit: null,
    benefit_details: [
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 4400,
      },
      {
        category: "other",
        title: "유쓰 너겟데이터",
        description: "만 19~34세 고객은 월 8GB를 추가로 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [],
  },
  "nerget-36": {
    membership_tier: null,
    smart_device_benefit: null,
    benefit_details: [
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 4400,
      },
      {
        category: "other",
        title: "유쓰 너겟데이터",
        description: "만 19~34세 고객은 월 12GB를 추가로 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [],
  },
  "nerget-39": {
    membership_tier: null,
    smart_device_benefit: null,
    benefit_details: [
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 4400,
      },
      {
        category: "other",
        title: "유쓰 너겟데이터",
        description: "만 19~34세 고객은 월 12GB를 추가로 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [],
  },
  "nerget-43": {
    membership_tier: null,
    smart_device_benefit: null,
    benefit_details: [
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 4400,
      },
      {
        category: "other",
        title: "유쓰 너겟데이터",
        description: "만 19~34세 고객은 월 15GB를 추가로 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [],
  },
  "nerget-46": {
    membership_tier: null,
    smart_device_benefit: null,
    benefit_details: [
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 4400,
      },
      {
        category: "other",
        title: "유쓰 너겟데이터",
        description: "만 19~34세 고객은 월 30GB를 추가로 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [],
  },
  "nerget-49": {
    membership_tier: null,
    smart_device_benefit: null,
    benefit_details: [
      {
        category: "payment",
        title: "네이버페이 등 쿠폰",
        description: "프로모션 조건에 따라 매달 쿠폰 혜택을 받을 수 있어요.",
        monthly_value: 20000,
      },
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 4400,
      },
      {
        category: "other",
        title: "유쓰 너겟데이터",
        description: "만 19~34세 고객은 월 45GB를 추가로 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [],
  },
  "nerget-59": {
    membership_tier: "VIP (24개월)",
    smart_device_benefit: null,
    benefit_details: [
      {
        category: "content",
        title: "OTT·구독 등 프리미엄플러스",
        description: "원하는 프리미엄플러스 혜택 1개를 선택할 수 있어요.",
        monthly_value: 29000,
      },
      {
        category: "payment",
        title: "네이버페이 등 너겟쿠폰",
        description:
          "프로모션 조건에 따라 원하는 제휴사의 너겟쿠폰을 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "membership",
        title: "U+ 멤버십 VIP콕",
        description:
          "110여 개 제휴사 VIP 할인과 VIP콕 혜택을 이용할 수 있어요.",
        monthly_value: null,
      },
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 4400,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [
      {
        code: "plus-benefit",
        step_type: "choice",
        section: "plus",
        section_title: "내가 원하는 혜택으로 꽉 채워보아요",
        title: "플러스혜택",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 10,
        depends_on: [],
        options: premiumPlus59,
      },
      {
        code: "samsung-device-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "삼성디바이스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 20,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["samsung-device"],
            match: "any",
          },
        ],
        options: samsungDevice59,
      },
      {
        code: "apple-device-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "애플디바이스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 21,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["apple-device"],
            match: "any",
          },
        ],
        options: appleDevice59,
      },
      {
        code: "mania-device-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "마니아디바이스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 22,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["mania-device"],
            match: "any",
          },
        ],
        options: maniaDevice,
      },
      {
        code: "netflix-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "넷플릭스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 23,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["netflix"],
            match: "any",
          },
        ],
        options: netflix59,
      },
      {
        code: "daily-plus-premium",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "데일리플러스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 24,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["daily"],
            match: "any",
          },
        ],
        options: dailyPlus,
      },
      {
        code: "nerget-coupon",
        step_type: "choice",
        section: "coupon",
        section_title: "너겟만의 혜택을 선택할 시간이에요",
        title: "너겟쿠폰",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 40,
        depends_on: [],
        options: nergetCouponOptions,
      },
      {
        code: "vip-membership",
        step_type: "info",
        section: "membership",
        section_title: "너겟을 통해 얻을 수 있는 혜택",
        title: "VIP 멤버십 혜택",
        instruction: "U+one에서 이용해 주세요",
        selection_count: 0,
        required: false,
        sort_order: 50,
        depends_on: [],
        options: vipPassInfo,
      },
      {
        code: "addon-benefit",
        step_type: "info",
        section: "addon",
        section_title: null,
        title: "부가 혜택",
        instruction: null,
        selection_count: 0,
        required: false,
        sort_order: 60,
        depends_on: [],
        options: [
          choiceOption(
            "family-bundle",
            "참 쉬운 가족 결합 할인",
            "가족과 결합하면 모바일 요금을 최대 4,400원 할인받을 수 있어요.",
            4400,
            "U+",
          ),
        ],
      },
    ],
  },
  "nerget-65": {
    membership_tier: "VIP (24개월)",
    smart_device_benefit: "스마트기기 1대 월정액 할인 최대 11,000원",
    benefit_details: [
      {
        category: "content",
        title: "OTT·구독 등 프리미엄플러스",
        description: "원하는 프리미엄플러스 혜택 1개를 선택할 수 있어요.",
        monthly_value: 52900,
      },
      {
        category: "payment",
        title: "네이버페이 등 너겟쿠폰",
        description:
          "프로모션 조건에 따라 원하는 제휴사의 너겟쿠폰을 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "membership",
        title: "U+ 멤버십 VIP콕",
        description:
          "110여 개 제휴사 VIP 할인과 VIP콕 혜택을 이용할 수 있어요.",
        monthly_value: null,
      },
      {
        category: "device",
        title: "스마트기기 월정액 할인",
        description: "스마트기기 1대의 월정액을 할인받을 수 있어요.",
        monthly_value: 11000,
      },
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 4400,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [
      {
        code: "plus-benefit",
        step_type: "choice",
        section: "plus",
        section_title: "내가 원하는 혜택으로 꽉 채워보아요",
        title: "플러스혜택",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 10,
        depends_on: [],
        options: premiumPlus65,
      },
      {
        code: "samsung-device-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "삼성디바이스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 20,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["samsung-device"],
            match: "any",
          },
        ],
        options: samsungDevice65And69,
      },
      {
        code: "apple-device-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "애플디바이스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 21,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["apple-device"],
            match: "any",
          },
        ],
        options: appleDevice65And69,
      },
      {
        code: "mania-device-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "마니아디바이스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 22,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["mania-device"],
            match: "any",
          },
        ],
        options: maniaDevice,
      },
      {
        code: "netflix-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "넷플릭스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 23,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["netflix"],
            match: "any",
          },
        ],
        options: netflix65,
      },
      {
        code: "daily-plus-premium",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "데일리플러스",
        instruction: "2개 선택해 주세요",
        selection_count: 2,
        required: true,
        sort_order: 24,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["daily"],
            match: "any",
          },
        ],
        options: dailyPlus,
      },
      {
        code: "nerget-coupon",
        step_type: "choice",
        section: "coupon",
        section_title: "너겟만의 혜택을 선택할 시간이에요",
        title: "너겟쿠폰",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 40,
        depends_on: [],
        options: nergetCouponOptions,
      },
      {
        code: "vip-membership",
        step_type: "info",
        section: "membership",
        section_title: "너겟을 통해 얻을 수 있는 혜택",
        title: "VIP 멤버십 혜택",
        instruction: "U+one에서 이용해 주세요",
        selection_count: 0,
        required: false,
        sort_order: 50,
        depends_on: [],
        options: vipPassInfo,
      },
      {
        code: "addon-benefit",
        step_type: "info",
        section: "addon",
        section_title: null,
        title: "부가 혜택",
        instruction: "U+one에서 별도 신청해 주세요",
        selection_count: 0,
        required: false,
        sort_order: 60,
        depends_on: [],
        options: [
          choiceOption(
            "smart-device-discount",
            "스마트기기 월정액 할인",
            "스마트기기 1대 월정액을 최대 11,000원 할인받을 수 있어요.",
            11000,
            "U+",
          ),
          choiceOption(
            "family-bundle",
            "참 쉬운 가족 결합 할인",
            "가족과 결합하면 모바일 요금을 최대 4,400원 할인받을 수 있어요.",
            4400,
            "U+",
          ),
        ],
      },
    ],
  },
  "nerget-69": {
    membership_tier: "VIP (24개월)",
    smart_device_benefit: "스마트기기 2대 월정액 할인 최대 22,000원",
    benefit_details: [
      {
        category: "content",
        title: "OTT·구독 등 프리미엄플러스",
        description: "원하는 프리미엄플러스 혜택 1개를 선택할 수 있어요.",
        monthly_value: 52900,
      },
      {
        category: "content",
        title: "콘텐츠·음악 감상 등 데일리플러스",
        description: "음악, 도서 등 데일리플러스 혜택 1개를 선택할 수 있어요.",
        monthly_value: 15000,
      },
      {
        category: "payment",
        title: "네이버페이 등 너겟쿠폰",
        description:
          "프로모션 조건에 따라 원하는 제휴사의 너겟쿠폰을 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "membership",
        title: "U+ 멤버십 VIP콕",
        description:
          "110여 개 제휴사 VIP 할인과 VIP콕 혜택을 이용할 수 있어요.",
        monthly_value: null,
      },
      {
        category: "device",
        title: "스마트기기 월정액 할인",
        description:
          "스마트기기 2대의 월정액을 1대당 최대 11,000원 할인받을 수 있어요.",
        monthly_value: 22000,
      },
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 6600,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [
      {
        code: "plus-benefit",
        step_type: "choice",
        section: "plus",
        section_title: "내가 원하는 혜택으로 꽉 채워보아요",
        title: "플러스혜택",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 10,
        depends_on: [],
        options: premiumPlus69,
      },
      {
        code: "samsung-device-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "삼성디바이스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 20,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["samsung-device"],
            match: "any",
          },
        ],
        options: samsungDevice65And69,
      },
      {
        code: "apple-device-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "애플디바이스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 21,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["apple-device"],
            match: "any",
          },
        ],
        options: appleDevice65And69,
      },
      {
        code: "mania-device-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "마니아디바이스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 22,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["mania-device"],
            match: "any",
          },
        ],
        options: maniaDevice,
      },
      {
        code: "netflix-detail",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "넷플릭스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 23,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["netflix"],
            match: "any",
          },
        ],
        options: netflix69,
      },
      {
        code: "daily-plus",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "데일리플러스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 30,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: premiumPlus69NonDailyCodes,
            match: "any",
          },
        ],
        options: dailyPlus,
      },
      {
        code: "daily-plus-premium",
        step_type: "choice",
        section: "premium",
        section_title: "특별혜택을 선택할 시간이에요",
        title: "데일리플러스",
        instruction: "3개 선택해 주세요",
        selection_count: 3,
        required: true,
        sort_order: 31,
        depends_on: [
          {
            step_code: "plus-benefit",
            option_codes: ["daily"],
            match: "any",
          },
        ],
        options: dailyPlus,
      },
      {
        code: "nerget-coupon",
        step_type: "choice",
        section: "coupon",
        section_title: "너겟만의 혜택을 선택할 시간이에요",
        title: "너겟쿠폰",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 40,
        depends_on: [],
        options: nergetCouponOptions,
      },
      {
        code: "vip-membership",
        step_type: "info",
        section: "membership",
        section_title: "너겟을 통해 얻을 수 있는 혜택",
        title: "VIP 멤버십 혜택",
        instruction: "U+one에서 이용해 주세요",
        selection_count: 0,
        required: false,
        sort_order: 50,
        depends_on: [],
        options: vipPassInfo,
      },
      {
        code: "addon-benefit",
        step_type: "info",
        section: "addon",
        section_title: null,
        title: "부가 혜택",
        instruction: "U+one에서 별도 신청해 주세요",
        selection_count: 0,
        required: false,
        sort_order: 60,
        depends_on: [],
        options: [
          choiceOption(
            "smart-device-discount",
            "스마트기기 월정액 할인",
            "스마트기기 2대 월정액을 최대 22,000원 할인받을 수 있어요.",
            22000,
            "U+",
          ),
          choiceOption(
            "family-bundle",
            "참 쉬운 가족 결합 할인",
            "가족과 결합하면 모바일 요금을 최대 6,600원 할인받을 수 있어요.",
            6600,
            "U+",
          ),
        ],
      },
    ],
  },
  "nerget-75": {
    membership_tier: "VIP",
    smart_device_benefit: "스마트기기 2대 월정액 할인 최대 33,000원",
    benefit_details: [
      {
        category: "content",
        title: "콘텐츠·음악 감상 등 데일리플러스",
        description: "음악, 도서 등 데일리플러스 혜택 1개를 선택할 수 있어요.",
        monthly_value: 15000,
      },
      {
        category: "payment",
        title: "네이버페이 등 너겟쿠폰",
        description:
          "프로모션 조건에 따라 원하는 제휴사의 너겟쿠폰을 받을 수 있어요.",
        monthly_value: null,
      },
      {
        category: "membership",
        title: "U+ 멤버십 VIP콕",
        description: "무료 영화 예매 등 VIP 등급 혜택을 이용할 수 있어요.",
        monthly_value: 7000,
      },
      {
        category: "device",
        title: "스마트기기 월정액 할인",
        description: "스마트기기 2대의 월정액을 할인받을 수 있어요.",
        monthly_value: 33000,
      },
      {
        category: "bundle",
        title: "참 쉬운 가족 결합 할인",
        description: "가족과 결합하면 모바일 요금을 할인받을 수 있어요.",
        monthly_value: 6600,
      },
      {
        category: "other",
        title: "피싱/해킹 안심 서비스",
        description: "피싱 또는 해킹 금융 피해를 보장하는 안심 혜택이에요.",
        monthly_value: null,
      },
    ],
    choice_benefits: [
      {
        code: "daily-plus",
        step_type: "choice",
        section: "plus",
        section_title: "내가 원하는 혜택으로 꽉 채워보아요",
        title: "데일리플러스",
        instruction: "1개 선택해 주세요",
        selection_count: 1,
        required: true,
        sort_order: 10,
        depends_on: [],
        options: dailyPlus,
      },
      {
        code: "promotion-info",
        step_type: "info",
        section: "coupon",
        section_title: "너겟만의 혜택",
        title: "프로모션 혜택",
        instruction: null,
        selection_count: 0,
        required: false,
        sort_order: 40,
        depends_on: [],
        options: [
          choiceOption(
            "npay-180000",
            "Npay 18만원",
            "현재 너겟75에 안내되는 프로모션 혜택",
            null,
            "N Pay",
          ),
        ],
      },
      {
        code: "vip-membership",
        step_type: "info",
        section: "membership",
        section_title: "너겟을 통해 얻을 수 있는 혜택",
        title: "VIP 멤버십 혜택",
        instruction: null,
        selection_count: 0,
        required: false,
        sort_order: 50,
        depends_on: [],
        options: [
          choiceOption(
            "vip-tier",
            "U+ 멤버십 VIP 등급",
            "너겟75 이용 시 VIP 등급 혜택을 받을 수 있어요.",
            null,
            "U+",
          ),
        ],
      },
      {
        code: "addon-benefit",
        step_type: "info",
        section: "addon",
        section_title: null,
        title: "부가 혜택",
        instruction: null,
        selection_count: 0,
        required: false,
        sort_order: 60,
        depends_on: [],
        options: [
          choiceOption(
            "smart-device-discount",
            "스마트기기 월정액 할인",
            "스마트기기 2대 월정액을 최대 33,000원 할인받을 수 있어요.",
            33000,
            "U+",
          ),
          choiceOption(
            "family-bundle",
            "참 쉬운 가족 결합 할인",
            "가족과 결합하면 모바일 요금을 최대 6,600원 할인받을 수 있어요.",
            6600,
            "U+",
          ),
        ],
      },
    ],
  },
};

const plans: IPlan[] = nergetPlanSpecs.map((plan) => {
  const details = planDetailOverrides[plan.code];
  const benefit_details = details?.benefit_details ?? [];
  const choice_benefits = details?.choice_benefits ?? [];

  return {
    code: plan.code,
    carrier: "LG_U_PLUS",
    product_line: "nerget",
    name: plan.name,
    category: plan.monthly_fee >= 59000 ? "premium" : "mobile",
    network: "5G",
    audiences: ["general", "app-first"],
    monthly_fee: plan.monthly_fee,
    discount_fee: null,
    data: plan.data,
    voice: "집/이동전화 무제한",
    additional_voice: "부가통화 300분",
    sms: "기본제공",
    membership_tier: details?.membership_tier ?? null,
    smart_device_benefit: details?.smart_device_benefit ?? null,
    promotion: plan.promotion,
    benefit_details,
    choice_benefits,
    is_popular: plan.is_popular,
    popular_order: plan.popular_order,
    perks: [
      ...benefit_details.map((benefit) => benefit.title),
      ...choice_benefits.map((benefit) =>
        benefit.step_type === "choice"
          ? `${benefit.title} ${benefit.selection_count}개 선택`
          : benefit.title,
      ),
    ],
    tags: plan.tags,
    recommendation_tags: plan.recommendation_tags,
    source_url: nergetPlanSourceUrl,
    source_checked_at: checkedAt,
    is_active: true,
    sort_order: plan.sort_order,
  };
});

const commonBenefitFields = {
  start_date: null,
  end_date: null,
  source_checked_at: checkedAt,
  is_active: true,
} satisfies Pick<
  IBenefit,
  "start_date" | "end_date" | "source_checked_at" | "is_active"
>;

const benefits: IBenefit[] = [
  {
    ...commonBenefitFields,
    code: "uplus-membership-basic",
    title: "U+ 멤버십 기본 혜택",
    category: "membership",
    benefit_type: "discount",
    partner: null,
    brand: "U+",
    summary:
      "베이커리, 피자, 편의점, 쇼핑 등 다양한 제휴처에서 받을 수 있는 U+ 멤버십 할인 혜택",
    eligibility: "U+ 멤버십 전 등급 고객",
    value: "제휴처별 할인 혜택",
    usage_limit: "제휴사별 이용 조건 및 횟수 상이",
    minMembershipTier: "우수",
    min_plan_monthly_fee: null,
    recommended_plan_codes: [],
    target_user_tags: ["멤버십", "할인", "쇼핑", "생활혜택"],
    recommendation_weight: 85,
    tags: ["U+멤버십", "우수", "VIP", "VVIP", "제휴할인"],
    source_url: membershipSourceUrl,
    sort_order: 200,
  },
  {
    ...commonBenefitFields,
    code: "uplus-vip-pick",
    title: "U+ 멤버십 VIP콕",
    category: "membership",
    benefit_type: "reward",
    partner: null,
    brand: "U+",
    summary:
      "VIP/VVIP 멤버십 고객이 매월 선택해서 이용할 수 있는 무료 또는 할인 혜택",
    eligibility: "U+ 멤버십 VIP 또는 VVIP 고객",
    value: "매월 1개의 VIP콕 혜택",
    usage_limit: "월 1회",
    minMembershipTier: "VIP",
    min_plan_monthly_fee: null,
    recommended_plan_codes: [],
    target_user_tags: ["VIP", "VVIP", "멤버십", "쿠폰", "생활혜택"],
    recommendation_weight: 95,
    tags: ["U+멤버십", "VIP", "VVIP", "VIP콕"],
    source_url: membershipSourceUrl,
    sort_order: 210,
  },
  {
    ...commonBenefitFields,
    code: "nerget-npay-coupon",
    title: "네이버페이 쿠폰 혜택",
    category: "payment",
    benefit_type: "coupon",
    partner: "네이버페이",
    brand: "N Pay",
    summary: "너겟 요금제 가입 고객에게 제공되는 결제/쇼핑 쿠폰형 혜택",
    eligibility: "너겟 요금제 이용 고객",
    value: "네이버페이 쿠폰",
    usage_limit: "프로모션 기간 및 월별 조건에 따라 제공",
    minMembershipTier: null,
    min_plan_monthly_fee: 26000,
    recommended_plan_codes: plans.map((plan) => plan.code),
    target_user_tags: ["쇼핑", "간편결제", "쿠폰선호"],
    recommendation_weight: 90,
    tags: ["너겟", "네이버페이", "쿠폰", "쇼핑"],
    source_url: nergetBenefitSourceUrl,
    sort_order: 10,
  },
  {
    ...commonBenefitFields,
    code: "nerget-family-data",
    title: "참 쉬운 가족 데이터",
    category: "family",
    benefit_type: "data",
    partner: null,
    brand: "U+",
    summary: "무제한형 너겟 요금제에서 가족에게 나눠줄 수 있는 데이터 혜택",
    eligibility: "너겟 무제한형 요금제 이용 고객",
    value: "요금제별 가족 데이터 제공",
    usage_limit: "요금제별 제공량 상이",
    minMembershipTier: null,
    min_plan_monthly_fee: 59000,
    recommended_plan_codes: [
      "nerget-59",
      "nerget-65",
      "nerget-69",
      "nerget-75",
    ],
    target_user_tags: ["가족", "데이터공유", "무제한"],
    recommendation_weight: 86,
    tags: ["너겟", "가족", "데이터공유"],
    source_url: nergetPlanSourceUrl,
    sort_order: 20,
  },
  {
    ...commonBenefitFields,
    code: "nerget-tethering-sharing",
    title: "테더링/쉐어링 데이터",
    category: "device",
    benefit_type: "data",
    partner: null,
    brand: "U+",
    summary: "태블릿, 노트북, 스마트기기와 함께 쓰기 좋은 테더링/쉐어링 데이터",
    eligibility: "너겟 무제한형 요금제 이용 고객",
    value: "요금제별 테더링/쉐어링 데이터 제공",
    usage_limit: "너겟59 70GB, 너겟65 80GB, 너겟69·75 100GB",
    minMembershipTier: null,
    min_plan_monthly_fee: 59000,
    recommended_plan_codes: [
      "nerget-59",
      "nerget-65",
      "nerget-69",
      "nerget-75",
    ],
    target_user_tags: ["핫스팟", "태블릿", "노트북", "외근"],
    recommendation_weight: 84,
    tags: ["너겟", "테더링", "쉐어링", "스마트기기"],
    source_url: nergetPlanSourceUrl,
    sort_order: 30,
  },
  {
    ...commonBenefitFields,
    code: "nerget-phishing-hacking-insurance",
    title: "피싱/해킹 보험 혜택",
    category: "safety",
    benefit_type: "insurance",
    partner: null,
    brand: "U+",
    summary: "금융사기와 보안 사고를 걱정하는 고객에게 추천하기 좋은 안전 혜택",
    eligibility: "너겟 요금제 또는 프로모션 조건 충족 고객",
    value: "피싱/해킹 피해 보장형 혜택",
    usage_limit: "상세 보장 조건은 프로모션 및 약관 기준",
    minMembershipTier: null,
    min_plan_monthly_fee: 26000,
    recommended_plan_codes: plans.map((plan) => plan.code),
    target_user_tags: ["보안", "금융", "부모님", "안심"],
    recommendation_weight: 78,
    tags: ["너겟", "보안", "보험"],
    source_url: nergetBenefitSourceUrl,
    sort_order: 40,
  },
  {
    ...commonBenefitFields,
    code: "nerget-ott-pack",
    title: "OTT/콘텐츠 팩 추천",
    category: "content",
    benefit_type: "bundle",
    partner: null,
    brand: "U+",
    summary: "영상 시청이 많은 고객에게 어울리는 콘텐츠형 부가 혜택",
    eligibility: "너겟 프리미엄/무제한형 고객 중심 추천",
    value: "OTT 및 콘텐츠 혜택 조합 추천",
    usage_limit: "선택 가능한 팩과 제공 조건은 시점별 상이",
    minMembershipTier: null,
    min_plan_monthly_fee: 59000,
    recommended_plan_codes: [
      "nerget-59",
      "nerget-65",
      "nerget-69",
      "nerget-75",
    ],
    target_user_tags: ["OTT", "영상시청", "콘텐츠", "무제한"],
    recommendation_weight: 82,
    tags: ["너겟", "OTT", "콘텐츠", "구독"],
    source_url: nergetBenefitSourceUrl,
    sort_order: 50,
  },
  {
    ...commonBenefitFields,
    code: "nerget-ai-subscription",
    title: "AI 구독 혜택 추천",
    category: "subscription",
    benefit_type: "subscription",
    partner: null,
    brand: "U+",
    summary: "AI 도구와 생산성 앱을 자주 쓰는 고객에게 추천하는 구독형 혜택",
    eligibility: "너겟 프리미엄/무제한형 고객 중심 추천",
    value: "AI/생산성 구독 혜택",
    usage_limit: "프로모션 및 선택 팩 조건에 따라 제공",
    minMembershipTier: null,
    min_plan_monthly_fee: 59000,
    recommended_plan_codes: [
      "nerget-59",
      "nerget-65",
      "nerget-69",
      "nerget-75",
    ],
    target_user_tags: ["AI", "생산성", "학습", "업무"],
    recommendation_weight: 76,
    tags: ["너겟", "AI", "구독"],
    source_url: nergetBenefitSourceUrl,
    sort_order: 60,
  },
  {
    ...commonBenefitFields,
    code: "nerget-device-discount",
    title: "스마트기기 할인/연결 혜택",
    category: "device",
    benefit_type: "device",
    partner: null,
    brand: "U+",
    summary:
      "워치, 태블릿, 노트북 테더링을 함께 쓰는 고객에게 맞는 기기형 혜택",
    eligibility: "스마트기기 사용 고객",
    value: "기기 연결 및 부가회선 활용 혜택",
    usage_limit: "기기/부가회선 조건별 상이",
    minMembershipTier: null,
    min_plan_monthly_fee: 46000,
    recommended_plan_codes: [
      "nerget-46",
      "nerget-49",
      "nerget-59",
      "nerget-65",
      "nerget-69",
      "nerget-75",
    ],
    target_user_tags: ["스마트기기", "태블릿", "워치", "핫스팟"],
    recommendation_weight: 74,
    tags: ["너겟", "스마트기기", "태블릿", "워치"],
    source_url: nergetBenefitSourceUrl,
    sort_order: 70,
  },
  {
    ...commonBenefitFields,
    code: "uplus-two-plus",
    title: "유플투쁠",
    category: "membership",
    benefit_type: "coupon",
    partner: null,
    brand: "U+ 멤버십",
    summary: "매월 다양한 제휴 브랜드 쿠폰을 받을 수 있는 U+ 멤버십 혜택",
    eligibility: "U+ 모바일 멤버십 고객",
    value: "외식, 문화, 쇼핑 쿠폰 제공",
    usage_limit: "월별 제공 쿠폰 상이",
    minMembershipTier: null,
    min_plan_monthly_fee: null,
    recommended_plan_codes: [],
    target_user_tags: ["쿠폰선호", "외식", "문화", "쇼핑"],
    recommendation_weight: 72,
    tags: ["멤버십", "쿠폰", "유플투쁠"],
    source_url: twoPlusSourceUrl,
    sort_order: 80,
    calendar_day: 1,
  },
  {
    ...commonBenefitFields,
    code: "uplus-cgv-benefit",
    title: "CGV 영화 혜택",
    category: "partner",
    benefit_type: "coupon",
    partner: "CGV",
    brand: "CGV",
    summary: "영화 예매 및 매점 이용 고객에게 추천하기 좋은 문화 혜택",
    eligibility: "U+ 멤버십 고객",
    value: "영화/매점 쿠폰 또는 할인",
    usage_limit: "월별 쿠폰 조건에 따라 제공",
    minMembershipTier: null,
    min_plan_monthly_fee: null,
    recommended_plan_codes: [],
    target_user_tags: ["영화", "데이트", "문화생활"],
    recommendation_weight: 70,
    tags: ["문화", "영화", "제휴", "쿠폰"],
    source_url: twoPlusSourceUrl,
    sort_order: 90,
    calendar_day: 5,
  },
  {
    ...commonBenefitFields,
    code: "uplus-baemin-benefit",
    title: "배달의민족 쿠폰 혜택",
    category: "partner",
    benefit_type: "coupon",
    partner: "배달의민족",
    brand: "배달의민족",
    summary: "배달 주문이 잦은 고객에게 추천하기 좋은 생활 쿠폰 혜택",
    eligibility: "U+ 멤버십 고객",
    value: "배달 주문 쿠폰 또는 할인",
    usage_limit: "월별 쿠폰 조건에 따라 제공",
    minMembershipTier: null,
    min_plan_monthly_fee: null,
    recommended_plan_codes: [],
    target_user_tags: ["배달", "자취", "외식", "쿠폰선호"],
    recommendation_weight: 70,
    tags: ["배달", "쿠폰", "제휴"],
    source_url: twoPlusSourceUrl,
    sort_order: 100,
    calendar_day: 10,
  },
  {
    ...commonBenefitFields,
    code: "uplus-oliveyoung-benefit",
    title: "올리브영 쇼핑 혜택",
    category: "partner",
    benefit_type: "coupon",
    partner: "올리브영",
    brand: "올리브영",
    summary: "뷰티/생활 상품 구매가 많은 고객에게 추천하는 쇼핑 혜택",
    eligibility: "U+ 멤버십 고객",
    value: "쇼핑 쿠폰 또는 할인",
    usage_limit: "월별 쿠폰 조건에 따라 제공",
    minMembershipTier: null,
    min_plan_monthly_fee: null,
    recommended_plan_codes: [],
    target_user_tags: ["쇼핑", "뷰티", "생활용품", "쿠폰선호"],
    recommendation_weight: 68,
    tags: ["쇼핑", "뷰티", "제휴", "쿠폰"],
    source_url: twoPlusSourceUrl,
    sort_order: 110,
    calendar_day: 15,
  },
  {
    ...commonBenefitFields,
    code: "uplus-starbucks-benefit",
    title: "스타벅스 카페 혜택",
    category: "partner",
    benefit_type: "coupon",
    partner: "스타벅스",
    brand: "스타벅스",
    summary: "카페 이용이 잦은 고객에게 추천하기 좋은 제휴 혜택",
    eligibility: "U+ 멤버십 고객",
    value: "음료 쿠폰 또는 할인",
    usage_limit: "월별 쿠폰 조건에 따라 제공",
    minMembershipTier: null,
    min_plan_monthly_fee: null,
    recommended_plan_codes: [],
    target_user_tags: ["카페", "커피", "출근", "쿠폰선호"],
    recommendation_weight: 68,
    tags: ["카페", "커피", "제휴", "쿠폰"],
    source_url: twoPlusSourceUrl,
    sort_order: 120,
    calendar_day: 20,
  },
  {
    ...commonBenefitFields,
    code: "uplus-choice-discount",
    title: "선택약정 할인",
    category: "discount",
    benefit_type: "discount",
    partner: null,
    brand: "U+",
    summary: "단말 지원금 대신 월 통신요금을 할인받는 약정 할인",
    eligibility: "선택약정 가입 가능 회선",
    value: "월정액 기준 할인",
    usage_limit: "약정 조건에 따라 제공",
    minMembershipTier: null,
    min_plan_monthly_fee: null,
    recommended_plan_codes: plans.map((plan) => plan.code),
    target_user_tags: ["통신비절약", "약정", "가성비"],
    recommendation_weight: 88,
    tags: ["요금할인", "약정", "절약"],
    source_url: nergetPlanSourceUrl,
    sort_order: 130,
  },
];

const missions: IMission[] = [
  {
    code: "mission-ai-nerget-diagnosis",
    title: "AI 너겟 요금제 진단",
    category: "subscription",
    summary:
      "최근 데이터 사용량과 선호 혜택을 기준으로 맞는 너겟 요금제를 찾는 미션",
    requirement: "AI 진단 시작",
    target_count: 1,
    reward_points: 100,
    start_date: null,
    end_date: null,
    status: "active",
    tags: ["AI", "너겟", "요금제", "절감"],
    target_user_tags: ["요금제추천", "통신비절약", "AI"],
    recommendation_weight: 95,
    source_url: nergetPlanSourceUrl,
    source_checked_at: checkedAt,
    is_active: true,
    sort_order: 10,
  },
  {
    code: "mission-nerget-plan-compare",
    title: "너겟 요금제 비교하기",
    category: "subscription",
    summary: "너겟 11개 요금제를 데이터 사용량과 가격 기준으로 비교하는 미션",
    requirement: "요금제 비교 화면 확인",
    target_count: 1,
    reward_points: 100,
    start_date: null,
    end_date: null,
    status: "active",
    tags: ["너겟", "요금제", "비교"],
    target_user_tags: ["요금제추천", "가성비", "데이터"],
    recommendation_weight: 90,
    source_url: nergetPlanSourceUrl,
    source_checked_at: checkedAt,
    is_active: true,
    sort_order: 20,
  },
  {
    code: "mission-benefit-preference",
    title: "관심 혜택 고르기",
    category: "profile",
    summary:
      "영화, 배달, 쇼핑, OTT 등 관심 혜택을 저장해 추천 정확도를 높이는 미션",
    requirement: "관심 혜택 3개 이상 선택",
    target_count: 1,
    reward_points: 50,
    start_date: null,
    end_date: null,
    status: "active",
    tags: ["혜택", "개인화", "추천"],
    target_user_tags: ["쿠폰선호", "개인화", "혜택추천"],
    recommendation_weight: 86,
    source_url: twoPlusSourceUrl,
    source_checked_at: checkedAt,
    is_active: true,
    sort_order: 30,
  },
  {
    code: "mission-uplus-one-attendance",
    title: "요고다 출석체크",
    category: "attendance",
    summary: "요고다에서 매일 출석하고 포인트를 받는 미션",
    requirement: "요고다 출석 탭에서 오늘 출석 완료",
    target_count: 1,
    reward_points: 30,
    start_date: null,
    end_date: null,
    status: "active",
    tags: ["출석", "앱", "이벤트"],
    target_user_tags: ["출석", "이벤트", "포인트"],
    recommendation_weight: 74,
    source_url: eventSourceUrl,
    source_checked_at: checkedAt,
    is_active: true,
    sort_order: 40,
  },
  {
    code: "mission-two-plus-coupon",
    title: "내 쿠폰함 확인하기",
    category: "event",
    summary: "요고다 쿠폰함에서 이번 달에 받은 쿠폰을 확인하는 미션",
    requirement: "MY 쿠폰함 화면 확인",
    target_count: 1,
    reward_points: 100,
    start_date: null,
    end_date: null,
    status: "active",
    tags: ["유플투쁠", "쿠폰", "혜택"],
    target_user_tags: ["쿠폰선호", "외식", "쇼핑"],
    recommendation_weight: 78,
    source_url: twoPlusSourceUrl,
    source_checked_at: checkedAt,
    is_active: true,
    sort_order: 50,
  },
  {
    code: "mission-security-benefit-check",
    title: "내 요금제 확인하기",
    category: "profile",
    summary: "현재 이용 중인 요금제와 멤버십 정보를 확인하는 미션",
    requirement: "MY 나의 요금제 화면 확인",
    target_count: 1,
    reward_points: 50,
    start_date: null,
    end_date: null,
    status: "active",
    tags: ["보안", "안심", "혜택"],
    target_user_tags: ["보안", "부모님", "금융"],
    recommendation_weight: 68,
    source_url: nergetBenefitSourceUrl,
    source_checked_at: checkedAt,
    is_active: true,
    sort_order: 60,
  },
  {
    code: "mission-august-event-check",
    title: "혜택 둘러보기",
    category: "event",
    summary: "요고다에서 현재 이용할 수 있는 혜택을 확인하는 미션",
    requirement: "혜택 전체 화면 확인",
    target_count: 1,
    reward_points: 100,
    start_date: null,
    end_date: null,
    status: "active",
    tags: ["이벤트", "8월", "응모"],
    target_user_tags: ["이벤트", "경품", "응모"],
    recommendation_weight: 64,
    source_url: eventSourceUrl,
    source_checked_at: checkedAt,
    is_active: true,
    sort_order: 70,
  },
];

async function deactivateLegacyPlans() {
  const result = await PlanModel.updateMany(
    { carrier: "LG_U_PLUS", code: { $in: legacyUplusPlanCodes } },
    { $set: { is_active: false, product_line: "uplus" } },
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
