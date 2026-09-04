import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Server } from "socket.io";
import authRoutes from "../../src/api/routes/auth.routes.ts";
import adminRoutes from "../../src/api/routes/admin.routes.ts";
import promptRoutes from "../../src/api/routes/prompt.routes.ts";
import couponRoutes from "../../src/api/routes/coupon.routes.ts";
import missionRoutes from "../../src/api/routes/mission.routes.ts";
import notificationRoutes from "../../src/api/routes/notification.routes.ts";
import subscriptionRoutes from "../../src/api/routes/subscription.routes.ts";
import usageRoutes from "../../src/api/routes/usage.routes.ts";
import planRoutes from "../../src/api/routes/plan.routes.ts";
import { setupNotificationSocket } from "../../src/api/websocket/notification.websocket.ts";
import {
  authMiddleware,
  adminMiddleware,
} from "../../src/core/middlewares/auth.middleware.ts";
import {
  securityHeaders,
  isAllowedSocketOrigin,
} from "../../src/core/middlewares/security.ts";
import { apiRateLimit } from "../../src/core/middlewares/rate-limit.ts";
import { env } from "../../src/core/config/env.ts";
import {
  createAccessToken,
  createRefreshToken,
} from "../../src/core/security/jwt.ts";
import { UserModel } from "../../src/models/user.model.ts";
import { BenefitModel } from "../../src/models/benefit.model.ts";
import { UserCouponModel } from "../../src/models/user-coupon.model.ts";
import { MissionModel } from "../../src/models/mission.model.ts";
import { UserMissionModel } from "../../src/models/user-mission.model.ts";
import { NotificationModel } from "../../src/models/notification.model.ts";
import { PointTransactionModel } from "../../src/models/point-transaction.model.ts";

export async function seedFixture(shortLivedToken = false, admin = false) {
  const suffix = randomUUID();
  const user = await UserModel.create({
    nickname: "Test User",
    role: admin ? "admin" : "user",
    provider: "google",
    provider_id: suffix,
  });
  const userId = user._id.toString();
  const refreshToken = createRefreshToken({ userId });
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { refresh_token: refreshToken } },
  );
  const benefit = await BenefitModel.create({
    code: "test-benefit-" + suffix,
    title: "Test coupon",
    category: "partner",
    benefit_type: "coupon",
    partner: "Test",
    summary: "Test benefit",
    eligibility: "All",
    value: "1000",
    source_url: "https://example.test",
    source_checked_at: new Date(),
  });
  const coupon = await UserCouponModel.create({
    user_id: user._id,
    benefit_id: benefit._id,
    issuance_key: "point-exchange:" + suffix,
    coupon_number: suffix,
    barcode_value: suffix.replaceAll("-", ""),
    issued_at: new Date(),
    expires_at: new Date(Date.now() + 86400000 * 10),
  });
  const mission = await MissionModel.create({
    code: "test-mission-" + suffix,
    title: "Test mission",
    category: "event",
    summary: "Test",
    requirement: "Test",
    reward_points: 100,
    source_url: "https://example.test",
    source_checked_at: new Date(),
  });
  await UserMissionModel.create({
    user_id: user._id,
    mission_id: mission._id,
    status: "completed",
    progress: 100,
  });
  const notification = await NotificationModel.create({
    user_id: user._id,
    type: "usage_pattern_changed",
    title: "Test notification",
    body: "Test recommendation is ready",
    dedupe_key: suffix,
    link: "/my/coupons",
  });
  return {
    user: {
      userId,
      name: user.nickname,
      role: admin ? "admin" : "user",
      isNewUser: false,
      provider: "google",
    },
    accessToken: shortLivedToken
      ? jwt.sign({ userId, type: "access" }, env.JWT_SECRET_KEY, {
          expiresIn: 40,
        })
      : createAccessToken({ userId }),
    refreshToken,
    couponId: coupon._id.toString(),
    missionCode: mission.code,
    missionId: mission._id.toString(),
    benefitId: benefit._id.toString(),
    notificationId: notification._id.toString(),
  };
}

export async function startHarness(port = 0) {
  if (mongoose.connection.readyState !== 0)
    throw new Error("Refusing to reuse an existing database connection");
  const replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ ip: "127.0.0.1" }],
  });
  const oldEnv = {
    JWT_SECRET_KEY: env.JWT_SECRET_KEY,
    NODE_ENV: env.NODE_ENV,
    AI_API_KEY: env.AI_API_KEY,
    CORS_ORIGIN: env.CORS_ORIGIN,
  };
  env.JWT_SECRET_KEY = "temporary-local-test-secret-not-for-production";
  env.NODE_ENV = "test";
  env.AI_API_KEY = "";
  env.CORS_ORIGIN = "http://127.0.0.1:3100";
  try {
    await mongoose.connect(
      replica.getUri("yogoda_test_" + randomUUID().replaceAll("-", "")),
    );
    for (const model of Object.values(mongoose.models)) await model.init();
  } catch (error) {
    await mongoose.disconnect();
    await replica.stop();
    Object.assign(env, oldEnv);
    throw error;
  }
  const app = express();
  app.disable("x-powered-by");
  app.use(
    securityHeaders,
    cors({ origin: env.CORS_ORIGIN, credentials: true }),
    express.json(),
    cookieParser(),
  );
  app.get("/__test/health", (_req, res) => res.json({ ready: true }));
  // Test-only fixture endpoint. This app is never imported by src/server.ts and only binds loopback.
  app.post("/__test/fixture", async (req, res) =>
    res.json(
      await seedFixture(
        req.body?.shortLivedToken === true,
        req.body?.admin === true,
      ),
    ),
  );
  app.use("/api", apiRateLimit);
  app.get("/api/admin-check", authMiddleware, adminMiddleware, (_req, res) =>
    res.json({ ok: true }),
  );
  app.use("/api/auth", authRoutes);
  app.use("/api/admin/prompts", promptRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/coupons", couponRoutes);
  app.use("/api/missions", missionRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/subscriptions", subscriptionRoutes);
  app.use("/api/usage", usageRoutes);
  app.use("/api/plans", planRoutes);
  app.use((error, _req, res, _next) =>
    res.status(error.statusCode ?? 500).json({ message: error.message }),
  );
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    allowRequest: (req, callback) =>
      callback(
        null,
        isAllowedSocketOrigin(req.headers.origin, [env.CORS_ORIGIN]),
      ),
    maxHttpBufferSize: 64 * 1024,
  });
  setupNotificationSocket(io);
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return {
    url: "http://127.0.0.1:" + server.address().port,
    close: async () => {
      await new Promise((resolve) => io.close(resolve));
      await mongoose.disconnect();
      await replica.stop();
      Object.assign(env, oldEnv);
    },
  };
}

export {
  mongoose,
  UserModel,
  UserCouponModel,
  UserMissionModel,
  PointTransactionModel,
};
