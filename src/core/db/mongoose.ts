import dns from "dns";
import mongoose from "mongoose";
import { env } from "../config/env.js";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

export const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      tls: true,
      retryWrites: false,
      directConnection: false,
    });
    console.log("✅ MongoDB 연결됨");
  } catch (err) {
    console.error("❌ MongoDB 연결 실패:", err);
    process.exit(1);
  }
};
