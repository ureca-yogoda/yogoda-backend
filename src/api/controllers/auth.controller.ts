import axios from "axios";
import { Request, Response, NextFunction } from "express";

import { env } from "../../core/config/env.js";
import { loginSchema } from "../../schemas/auth.schema.js";
import { loginWithKakao } from "../../services/auth.service.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: Number(env.REFRESH_TOKEN_EXPIRE_DAYS) * 24 * 60 * 60 * 1000,
};

export const kakaoLoginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { code } = loginSchema.parse(req.body);
    const result = await loginWithKakao(code);

    res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);

    res.status(200).json({
      accessToken: result.accessToken,
      userId: result.userId,
      name: result.nickname,
      theme: result.theme,
      isNewUser: result.isNewUser,
      role: result.role,
    });
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      res.status(401).json({ message: "카카오 인증에 실패했어요." });
      return;
    }

    next(err);
  }
};
