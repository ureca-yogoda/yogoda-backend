import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { StoreModel, type IStore } from "../models/store.model.js";

const sourceUrl = "https://www.lguplus.com/support/rental-phone/find-store";
const commonServices: IStore["services"] = [
  "mobile",
  "internet",
  "payment",
  "support",
  "data_transfer",
];

const stores: IStore[] = [
  {
    code: "yeouido-ilex",
    name: "여의도동 아일렉스점",
    region: "서울",
    district: "영등포구",
    address: "서울특별시 영등포구 의사당대로 108 105호",
    phone: "070-4090-8010",
    weekdayHours: "10:00 - 20:00",
    saturdayHours: "10:00 - 20:00",
    sundayHours: null,
    services: commonServices,
    location: { type: "Point", coordinates: [126.9244, 37.5218] },
    isDirect: true,
    isActive: true,
    sourceUrl,
  },
  {
    code: "bulgwang-station",
    name: "대조동 불광역점",
    region: "서울",
    district: "은평구",
    address: "서울특별시 은평구 불광로 29-1",
    phone: "010-5782-0114",
    weekdayHours: "10:00 - 20:00",
    saturdayHours: "10:00 - 20:00",
    sundayHours: null,
    services: commonServices,
    location: { type: "Point", coordinates: [126.9297, 37.6101] },
    isDirect: true,
    isActive: true,
    sourceUrl,
  },
  {
    code: "suyu-exit-5",
    name: "수유동 수유역5번출구점",
    region: "서울",
    district: "강북구",
    address: "서울특별시 강북구 도봉로 327 1층",
    phone: "070-7543-8072",
    weekdayHours: "10:00 - 20:00",
    saturdayHours: "10:00 - 20:00",
    sundayHours: null,
    services: commonServices,
    location: { type: "Point", coordinates: [127.0255, 37.6387] },
    isDirect: true,
    isActive: true,
    sourceUrl,
  },
  {
    code: "gajwa-station",
    name: "남가좌동 가좌역점",
    region: "서울",
    district: "서대문구",
    address: "서울특별시 서대문구 수색로 38",
    phone: null,
    weekdayHours: "10:00 - 20:00",
    saturdayHours: "10:00 - 20:00",
    sundayHours: null,
    services: ["mobile", "internet", "payment", "support"],
    location: { type: "Point", coordinates: [126.9147, 37.5686] },
    isDirect: true,
    isActive: true,
    sourceUrl,
  },
];

async function seedStores() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  for (const store of stores) {
    await StoreModel.updateOne(
      { code: store.code },
      { $set: store },
      { upsert: true },
    );
  }

  console.log(`✅ 직영 매장 ${stores.length}건 upsert 완료`);
  await mongoose.connection.close();
}

seedStores().catch(async (error: unknown) => {
  console.error("❌ 직영 매장 시드 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
