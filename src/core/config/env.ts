import dotenv from "dotenv";
import { z } from "zod";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("8000"),
  NODE_ENV: z.string().default("development"),
  KEY_VAULT_URL: z.string().default(""),
  JWT_SECRET_KEY: z.string().default(""),
  JWT_ALGORITHM: z.string().default(""),
  ACCESS_TOKEN_EXPIRE_MINUTES: z.string().default("30"),
  REFRESH_TOKEN_EXPIRE_DAYS: z.string().default("7"),
  MONGODB_URI: z.string().default(""),
  MONGODB_DB_NAME: z.string().default(""),
  KAKAO_CLIENT_ID: z.string().default(""),
  KAKAO_CLIENT_SECRET: z.string().default(""),
  KAKAO_REDIRECT_URI: z.string().default(""),
  NAVER_CLIENT_ID: z.string().default(""),
  NAVER_CLIENT_SECRET: z.string().default(""),
  NAVER_REDIRECT_URI: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z.string().default(""),
  // 콤마로 여러 origin 구분 (로컬 + 배포 프론트 주소 등)
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
});

type Settings = z.infer<typeof envSchema>;

// 필수값도 일단 기본값 ""으로 느슨하게 파싱 — Key Vault로 나중에 채워질 수 있어서 assertRequiredEnv()에서 따로 검증
const settings: Settings = envSchema.parse(process.env);

// AI_API_KEY, AI_MODEL은 선택 기능이라 여기 포함하지 않고 웹소켓 핸들러에서 개별 검증
const REQUIRED_KEYS = [
  "JWT_SECRET_KEY",
  "JWT_ALGORITHM",
  "MONGODB_URI",
  "MONGODB_DB_NAME",
  "KAKAO_CLIENT_ID",
  "KAKAO_CLIENT_SECRET",
  "KAKAO_REDIRECT_URI",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
  "NAVER_REDIRECT_URI",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
] as const satisfies readonly (keyof Settings)[];

export async function loadSecrets() {
  if (!settings.KEY_VAULT_URL) return;

  console.log("🔐 Key Vault에서 시크릿 로드 중...");

  const credential = new DefaultAzureCredential();
  const client = new SecretClient(settings.KEY_VAULT_URL, credential);

  for await (const secretProperties of client.listPropertiesOfSecrets()) {
    // Key Vault 시크릿 이름은 하이픈, 환경변수는 언더스코어 컨벤션이라 변환 필요
    const settingKey = secretProperties.name.replace(/-/g, "_").toUpperCase();

    if (settingKey in settings) {
      const secret = await client.getSecret(secretProperties.name);
      if (secret.value) {
        (settings as Record<string, string>)[settingKey] = secret.value;
      }
    }
  }

  console.log("✅ Key Vault 시크릿 로드 완료");
}

export function assertRequiredEnv() {
  const missing = REQUIRED_KEYS.filter((key) => !settings[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

export const env = settings;
