import jwt, { JwtPayload } from "jsonwebtoken";

import { env } from "../config/env.js";
import { AppError } from "../../utils/AppError.js";

type TokenData = Record<string, unknown>;

export const createAccessToken = (data: TokenData): string => {
  return jwt.sign({ ...data, type: "access" }, env.JWT_SECRET_KEY, {
    expiresIn: Number(env.ACCESS_TOKEN_EXPIRE_MINUTES) * 60,
  });
};

export const createRefreshToken = (data: TokenData): string => {
  return jwt.sign({ ...data, type: "refresh" }, env.JWT_SECRET_KEY, {
    expiresIn: Number(env.REFRESH_TOKEN_EXPIRE_DAYS) * 24 * 60 * 60,
  });
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET_KEY, {
      algorithms: ["HS256"],
    });

    if (typeof decoded === "string") {
      throw new AppError(401, "유효하지 않은 토큰이에요.");
    }

    return decoded;
  } catch {
    throw new AppError(401, "유효하지 않은 토큰이에요.");
  }
};

export const verifyAccessToken = (token: string): JwtPayload => {
  const payload = verifyToken(token);
  // Existing access tokens had no type claim; accept those until they expire.
  if (
    (payload.type !== undefined && payload.type !== "access") ||
    typeof payload.userId !== "string" ||
    !/^[a-f0-9]{24}$/i.test(payload.userId)
  ) {
    throw new AppError(401, "액세스 토큰이 필요해요.");
  }
  return payload;
};
