import mongoose from "mongoose";

import { assertRequiredEnv, loadSecrets } from "../core/config/env.js";
import { connectDB } from "../core/db/mongoose.js";
import { BenefitModel } from "../models/benefit.model.js";
import { PointProductModel } from "../models/point-product.model.js";

const products = [
  { benefitCode: "uplus-cgv-benefit", exchangePoints: 1000, stock: 100 },
  {
    benefitCode: "uplus-starbucks-benefit",
    exchangePoints: 1500,
    stock: 100,
  },
  { benefitCode: "uplus-baemin-benefit", exchangePoints: 2000, stock: 100 },
];

async function seedPointProducts() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  for (const [index, item] of products.entries()) {
    const benefit = await BenefitModel.findOne({ code: item.benefitCode });
    if (!benefit) {
      console.warn(`⚠️ 혜택 없음: ${item.benefitCode}`);
      continue;
    }
    await PointProductModel.updateOne(
      { code: `point-${item.benefitCode}` },
      {
        $set: {
          benefit_id: benefit._id,
          exchange_points: item.exchangePoints,
          validity_days: 30,
          is_active: true,
          sort_order: index,
        },
        $setOnInsert: { stock: item.stock },
      },
      { upsert: true },
    );
  }

  console.log("✅ 포인트 교환 상품 시드 완료");
  await mongoose.connection.close();
}

seedPointProducts().catch(async (error: unknown) => {
  console.error("❌ 포인트 교환 상품 시드 실패:", error);
  await mongoose.connection.close();
  process.exit(1);
});
