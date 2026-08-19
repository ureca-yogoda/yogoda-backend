import axios from "axios";
import { env } from "../core/config/env.js";

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

interface GoogleUserInfoResponse {
  id: string;
  name?: string;
}

export interface GoogleUser {
  googleId: string;
  name: string;
}

export const getGoogleToken = async (code: string): Promise<string> => {
  const { data } = await axios.post<GoogleTokenResponse>(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      code,
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  );

  return data.access_token;
};

export const getGoogleUserInfo = async (
  googleAccessToken: string,
): Promise<GoogleUser> => {
  const { data } = await axios.get<GoogleUserInfoResponse>(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    },
  );

  return {
    googleId: data.id,
    name: data.name || "사용자",
  };
};
