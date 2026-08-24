import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { BenefitModel } from "../models/benefit.model.js";

const schedules = [
  { code: "uplus-two-plus", calendarDay: 1 },
  { code: "uplus-cgv-benefit", calendarDay: 5 },
  { code: "uplus-baemin-benefit", calendarDay: 10 },
  { code: "uplus-oliveyoung-benefit", calendarDay: 15 },
  { code: "uplus-starbucks-benefit", calendarDay: 20 },
];

async function updateBenefitSchedules() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();
  for (const schedule of schedules) {
    await BenefitModel.updateOne(
      { code: schedule.code },
      { $set: { calendarDay: schedule.calendarDay } },
    );
  }
  await mongoose.connection.close();
  console.log(`✅ 월간 혜택 일정 ${schedules.length}건 갱신 완료`);
}

updateBenefitSchedules().catch(async (error: unknown) => {
  console.error("❌ 월간 혜택 일정 갱신 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
