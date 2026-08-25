import { createServer } from "http";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { Server } from "socket.io";

import authRoutes from "./api/routes/auth.routes.js";
import planRoutes from "./api/routes/plan.routes.js";
import chatRoutes from "./api/routes/chat.routes.js";
import couponRoutes from "./api/routes/coupon.routes.js";
import benefitRoutes from "./api/routes/benefit.routes.js";
import missionRoutes from "./api/routes/mission.routes.js";
import storeRoutes from "./api/routes/store.routes.js";
import rewardRoutes from "./api/routes/reward.routes.js";
import promptRoutes from "./api/routes/prompt.routes.js";
import adminRoutes from "./api/routes/admin.routes.js";
import { setupChatSocket } from "./api/websocket/chat.websocket.js";
import { setupNotificationSocket } from "./api/websocket/notification.websocket.js";
import notificationRoutes from "./api/routes/notification.routes.js";
import { assertRequiredEnv, env, loadSecrets } from "./core/config/env.js";
import { swaggerSpec } from "./core/config/swagger.js";
import { connectDB } from "./core/db/mongoose.js";
import { errorHandler } from "./core/middlewares/errorHandler.js";
import { startScheduledJobs } from "./core/scheduler.js";

const app = express();
const corsOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim());

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.redirect("/api-docs");
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth", authRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/benefits", benefitRoutes);
app.use("/api/missions", missionRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/admin/prompts", promptRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);

app.use(errorHandler);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    credentials: true,
  },
});
setupChatSocket(io);
setupNotificationSocket(io);

async function bootstrap() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  startScheduledJobs();

  httpServer.listen(env.PORT, () => {
    console.log(`🚀 서버 실행 중 (포트: ${env.PORT})`);
  });
}

bootstrap();
