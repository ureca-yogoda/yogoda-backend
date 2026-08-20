import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { WebSocketServer } from "ws";

import authRoutes from "./api/routes/auth.routes.js";
import planRoutes from "./api/routes/plan.routes.js";
import chatRoutes from "./api/routes/chat.routes.js";
import { setupChatWebSocket } from "./api/websocket/chat.websocket.js";
import { assertRequiredEnv, env, loadSecrets } from "./core/config/env.js";
import { swaggerSpec } from "./core/config/swagger.js";
import { connectDB } from "./core/db/mongoose.js";
import { errorHandler } from "./core/middlewares/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
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

app.use(errorHandler);

const wss = new WebSocketServer({ noServer: true });
setupChatWebSocket(wss);

async function bootstrap() {
  await loadSecrets();
  assertRequiredEnv();
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 서버 실행 중 (포트: ${env.PORT})`);
  });

  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(
      request.url || "",
      `http://${request.headers.host}`,
    ).pathname;
    if (pathname === "/api/chats/stream") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });
}

bootstrap();
