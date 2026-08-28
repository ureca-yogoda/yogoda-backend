import mongoose, { Types } from "mongoose";

import { BenefitModel } from "../models/benefit.model.js";
import { PointProductModel } from "../models/point-product.model.js";
import { PointTransactionModel } from "../models/point-transaction.model.js";
import { UserCouponModel } from "../models/user-coupon.model.js";
import { UserModel } from "../models/user.model.js";
import { AppError } from "../utils/AppError.js";
import {
  createBarcodeValue,
  createCouponNumber,
} from "../utils/coupon-credentials.js";
import { getPointWallet } from "./point.service.js";

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export async function getPointProducts(userId: string) {
  const [products, wallet] = await Promise.all([
    PointProductModel.find({ is_active: true })
      .sort({ sort_order: 1, exchange_points: 1 })
      .lean(),
    getPointWallet(userId),
  ]);
  const benefits = await BenefitModel.find({
    _id: { $in: products.map((product) => product.benefit_id) },
    is_active: true,
  }).lean();
  const benefitMap = new Map(
    benefits.map((benefit) => [benefit._id.toString(), benefit]),
  );

  return {
    balance: wallet.balance,
    products: products.flatMap((product) => {
      const benefit = benefitMap.get(product.benefit_id.toString());
      if (!benefit) return [];

      return [
        {
          code: product.code,
          title: benefit.title,
          summary: benefit.summary,
          value: benefit.value,
          brand: benefit.brand,
          partner: benefit.partner,
          exchangePoints: product.exchange_points,
          validityDays: product.validity_days,
          stock: product.stock,
          soldOut: product.stock === 0,
          exchangeable:
            product.stock !== 0 && wallet.balance >= product.exchange_points,
        },
      ];
    }),
  };
}

export async function exchangePointProduct(
  userId: string,
  productCode: string,
  idempotencyKey: string,
) {
  const session = await mongoose.startSession();
  const sourceKey = `point-exchange:${idempotencyKey}`;
  let exchangedCouponId: string | null = null;

  try {
    exchangedCouponId = await session.withTransaction(async () => {
      // 사용자 문서를 먼저 갱신해 서로 다른 상품의 동시 교환도 잔액 확인 순서대로 처리함
      const userLock = await UserModel.updateOne(
        { _id: new Types.ObjectId(userId) },
        { $set: { updated_at: new Date() } },
        { session },
      );
      if (userLock.matchedCount !== 1) {
        throw new AppError(404, "유저를 찾을 수 없어요.");
      }

      const previousTransaction = await PointTransactionModel.findOne({
        user_id: userId,
        source_key: sourceKey,
      })
        .session(session)
        .lean();

      if (previousTransaction) {
        const previousCoupon = await UserCouponModel.findOne({
          user_id: userId,
          issuance_key: sourceKey,
        })
          .session(session)
          .lean();
        if (!previousCoupon) {
          throw new AppError(409, "교환 처리 상태를 확인할 수 없어요.");
        }
        return previousCoupon._id.toString();
      }

      const product = await PointProductModel.findOne({
        code: productCode,
        is_active: true,
      }).session(session);
      if (!product) {
        throw new AppError(404, "교환 상품을 찾을 수 없어요.");
      }

      const benefit = await BenefitModel.findOne({
        _id: product.benefit_id,
        is_active: true,
      })
        .session(session)
        .lean();
      if (!benefit) {
        throw new AppError(409, "현재 교환할 수 없는 상품이에요.");
      }

      const [wallet] = await PointTransactionModel.aggregate<{
        balance: number;
      }>([
        { $match: { user_id: new Types.ObjectId(userId) } },
        { $group: { _id: null, balance: { $sum: "$amount" } } },
      ]).session(session);
      if ((wallet?.balance ?? 0) < product.exchange_points) {
        throw new AppError(409, "포인트가 부족해요.");
      }

      if (product.stock !== null) {
        const stockResult = await PointProductModel.updateOne(
          { _id: product._id, stock: { $gt: 0 } },
          { $inc: { stock: -1 } },
          { session },
        );
        if (stockResult.modifiedCount !== 1) {
          throw new AppError(409, "상품 재고가 모두 소진되었어요.");
        }
      }

      const now = new Date();
      const [coupon] = await UserCouponModel.create(
        [
          {
            user_id: new Types.ObjectId(userId),
            benefit_id: product.benefit_id,
            issuance_key: sourceKey,
            coupon_number: createCouponNumber(),
            barcode_value: createBarcodeValue(),
            status: "available",
            issued_at: now,
            expires_at: addDays(now, product.validity_days),
            used_at: null,
          },
        ],
        { session },
      );
      await PointTransactionModel.create(
        [
          {
            user_id: new Types.ObjectId(userId),
            amount: -product.exchange_points,
            reason: `${benefit.title} 교환`,
            source_key: sourceKey,
          },
        ],
        { session },
      );
      return coupon._id.toString();
    });
  } finally {
    await session.endSession();
  }

  if (!exchangedCouponId) {
    throw new AppError(500, "상품 교환을 완료하지 못했어요.");
  }

  return {
    couponId: exchangedCouponId,
    wallet: await getPointWallet(userId),
  };
}
