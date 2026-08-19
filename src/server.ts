import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

import authRoutes from "./api/routes/auth.routes.js";
import planRoutes from "./api/routes/plan.routes.js";
import { env, loadSecrets, assertRequiredEnv } from "./core/config/env.js";
import { connectDB } from "./core/db/mongoose.js";
import { swaggerSpec } from "./core/config/swagger.js";
import { errorHandler } from "./core/middlewares/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  }),
);

app.use(express.json());

app.get("/", (req, res) => res.redirect("/api-docs"));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth", authRoutes);
app.use("/api/plans", planRoutes);

app.use(errorHandler);

async function bootstrap() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  app.listen(env.PORT, () => {
    console.log(`🚀 서버 실행 중 (포트: ${env.PORT})`);
  });
}

bootstrap();
