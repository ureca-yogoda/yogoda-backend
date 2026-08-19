import crypto from "crypto";

import axios from "axios";
import { env } from "../core/config/env.js";
import { AppError } from "../utils/AppError.js";

interface NaverTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: string;
  error?: string;
  error_description?: string;
}

interface NaverUserInfoResponse {
  resultcode: string;
  message: string;
  response: {
    id: string;
    nickname?: string;
    name?: string;
  };
}

export interface NaverUser {
  naverId: string;
  nickname: string;
}

export const getNaverToken = async (code: string): Promise<string> => {
  const { data } = await axios.get<NaverTokenResponse>(
    "https://nid.naver.com/oauth2.0/token",
    {
      params: {
        grant_type: "authorization_code",
        client_id: env.NAVER_CLIENT_ID,
        client_secret: env.NAVER_CLIENT_SECRET,
        redirect_uri: env.NAVER_REDIRECT_URI,
        code,
        // CSRF 방지용 state — 프론트에서 인가 코드 발급 시점에 이미 검증했으므로 여기선 형식상 값만 전달
        state: crypto.randomUUID(),
      },
    },
  );

  // 네이버는 인가 코드가 유효하지 않아도 HTTP 200과 함께 body에 error를 담아 응답함
  if (data.error) {
    console.error("네이버 토큰 발급 실패:", data.error, data.error_description);
    throw new AppError(401, "네이버 인증에 실패했어요.");
  }

  return data.access_token;
};

export const getNaverUserInfo = async (
  naverAccessToken: string,
): Promise<NaverUser> => {
  const { data } = await axios.get<NaverUserInfoResponse>(
    "https://openapi.naver.com/v1/nid/me",
    {
      headers: { Authorization: `Bearer ${naverAccessToken}` },
    },
  );

  if (data.resultcode !== "00") {
    throw new AppError(401, "네이버 인증에 실패했어요.");
  }

  return {
    naverId: data.response.id,
    nickname: data.response.nickname || data.response.name || "사용자",
  };
};
