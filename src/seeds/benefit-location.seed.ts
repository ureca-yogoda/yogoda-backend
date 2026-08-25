import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { BenefitLocationModel } from "../models/benefit-location.model.js";
import { BenefitModel } from "../models/benefit.model.js";
import { geocodeAddress } from "../services/naver-geocoding.service.js";

const locations = [
  {
    benefitCode: "uplus-cgv-benefit",
    code: "cgv-gangnam",
    name: "CGV 강남",
    category: "culture",
    address: "서울특별시 강남구 강남대로 438",
  },
  {
    benefitCode: "uplus-cgv-benefit",
    code: "cgv-gangbyeon",
    name: "CGV 강변",
    category: "culture",
    address: "서울특별시 광진구 광나루로56길 85",
  },
  {
    benefitCode: "uplus-cgv-benefit",
    code: "cgv-guro",
    name: "CGV 구로",
    category: "culture",
    address: "서울특별시 구로구 구로중앙로 152",
  },
  {
    benefitCode: "uplus-cgv-benefit",
    code: "cgv-daehakro",
    name: "CGV 대학로",
    category: "culture",
    address: "서울특별시 종로구 대명길 28",
  },
  {
    benefitCode: "uplus-cgv-benefit",
    code: "cgv-dongdaemun",
    name: "CGV 동대문",
    category: "culture",
    address: "서울특별시 중구 장충단로13길 20",
  },
  {
    benefitCode: "uplus-cgv-benefit",
    code: "cgv-yeouido",
    name: "CGV 여의도",
    category: "culture",
    address: "서울특별시 영등포구 국제금융로 10",
  },
  {
    benefitCode: "uplus-cgv-benefit",
    code: "cgv-yeongdeungpo",
    name: "CGV 영등포타임스퀘어",
    category: "culture",
    address: "서울특별시 영등포구 영중로 15",
  },
  {
    benefitCode: "uplus-cgv-benefit",
    code: "cgv-yongsan",
    name: "CGV 용산아이파크몰",
    category: "culture",
    address: "서울특별시 용산구 한강대로23길 55",
  },
  {
    benefitCode: "uplus-cgv-benefit",
    code: "cgv-wangsimni",
    name: "CGV 왕십리",
    category: "culture",
    address: "서울특별시 성동구 왕십리광장로 17",
  },
  {
    benefitCode: "uplus-starbucks-benefit",
    code: "starbucks-gangnam",
    name: "스타벅스 강남대로점",
    category: "food",
    address: "서울특별시 강남구 강남대로 428",
  },
  {
    benefitCode: "uplus-oliveyoung-benefit",
    code: "oliveyoung-euljiro",
    name: "올리브영 을지로점",
    category: "shopping",
    address: "서울특별시 중구 을지로 100",
  },
] as const;

async function seedBenefitLocations() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  let updated = 0;
  for (const location of locations) {
    const benefit = await BenefitModel.findOne({ code: location.benefitCode })
      .select("_id")
      .lean();
    if (!benefit) {
      console.warn(
        `혜택을 찾을 수 없어 위치 등록 건너뜀: ${location.benefitCode}`,
      );
      continue;
    }
    const coordinates = await geocodeAddress(location.address);
    await BenefitLocationModel.updateOne(
      { code: location.code },
      {
        $set: {
          benefit_id: benefit._id,
          name: location.name,
          category: location.category,
          address: location.address,
          phone: null,
          location: {
            type: "Point",
            coordinates: [coordinates.longitude, coordinates.latitude],
          },
          isActive: true,
        },
      },
      { upsert: true },
    );
    updated += 1;
  }

  await mongoose.connection.close();
  console.log(`혜택 매장 위치 ${updated}건 등록 완료`);
}

seedBenefitLocations().catch(async (error: unknown) => {
  console.error("혜택 매장 위치 등록 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
