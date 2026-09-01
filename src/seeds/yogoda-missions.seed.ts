import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { MissionModel } from "../models/mission.model.js";

const updates = [
  {
    code: "mission-uplus-one-attendance",
    title: "요고다 출석체크",
    summary: "요고다에서 매일 출석하고 포인트를 받는 미션",
    requirement: "요고다 출석 탭에서 오늘 출석 완료",
    reward_points: 30,
  },
  {
    code: "mission-two-plus-coupon",
    title: "내 쿠폰함 확인하기",
    summary: "요고다 쿠폰함에서 이번 달에 받은 쿠폰을 확인하는 미션",
    requirement: "MY 쿠폰함 화면 확인",
    reward_points: 100,
  },
  {
    code: "mission-security-benefit-check",
    title: "내 요금제 확인하기",
    summary: "현재 이용 중인 요금제와 멤버십 정보를 확인하는 미션",
    requirement: "MY 나의 요금제 화면 확인",
    reward_points: 50,
  },
  {
    code: "mission-august-event-check",
    title: "혜택 둘러보기",
    summary: "요고다에서 현재 이용할 수 있는 혜택을 확인하는 미션",
    requirement: "혜택 전체 화면 확인",
    reward_points: 100,
    start_date: null,
    end_date: null,
  },
];

async function updateYogodaMissions() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  for (const mission of updates) {
    const { code, ...fields } = mission;
    await MissionModel.updateOne({ code }, { $set: fields });
  }

  await mongoose.connection.close();
  console.log(`✅ 요고다 미션 ${updates.length}건 갱신 완료`);
}

updateYogodaMissions().catch(async (error: unknown) => {
  console.error("❌ 요고다 미션 갱신 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
