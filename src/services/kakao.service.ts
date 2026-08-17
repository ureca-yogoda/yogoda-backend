import axios from "axios";
import { env } from "../core/config/env.js";

interface KakaoTokenResponse {
    access_token: string;
    token_type: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
}

interface KakaoUserInfoResponse {
    id: number;
    kakao_account?: {
        profile?: {
            nickname?: string;
        };
    };
}

export interface KakaoUser {
    kakaoId: string;
    nickname: string;
}

export const getKakaoToken = async (code: string): Promise<string> => {
    const { data } = await axios.post<KakaoTokenResponse>(
        "https://kauth.kakao.com/oauth/token",
        new URLSearchParams({
            grant_type: "authorization_code",
            client_id: env.KAKAO_CLIENT_ID,
            client_secret: env.KAKAO_CLIENT_SECRET,
            redirect_uri: env.KAKAO_REDIRECT_URI,
            code,
        }),
        {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
    );

    return data.access_token;
};

export const getKakaoUserInfo = async (
    kakaoAccessToken: string,
): Promise<KakaoUser> => {
    const { data } = await axios.get<KakaoUserInfoResponse>(
        "https://kapi.kakao.com/v2/user/me",
        {
            headers: { Authorization: `Bearer ${kakaoAccessToken}` },
        },
    );

    return {
        kakaoId: data.id.toString(),
        nickname: data.kakao_account?.profile?.nickname || "사용자",
    };
};
