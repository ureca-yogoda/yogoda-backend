import axios from "axios";
import { Request, Response, NextFunction } from "express";

import { env } from "../../core/config/env.js";
import { loginSchema } from "../../schemas/auth.schema.js";
import {
  loginWithKakao,
  loginWithNaver,
  loginWithGoogle,
  refreshAccessToken,
  logout,
} from "../../services/auth.service.js";

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

export const naverLoginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { code } = loginSchema.parse(req.body);
    const result = await loginWithNaver(code);

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
      res.status(401).json({ message: "네이버 인증에 실패했어요." });
      return;
    }

    next(err);
  }
};

export const googleLoginHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { code } = loginSchema.parse(req.body);
    const result = await loginWithGoogle(code);

    res.cookie("refreshToken", result.refreshToken, COOKIE_OPTIONS);

    res.status(200).json({
      accessToken: result.accessToken,
      userId: result.userId,
      name: result.nickname,
      theme: result.theme,
      isNewUser: result.isNewUser,
    });
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      console.error("구글 인증 실패:", err.response?.data);
      res.status(401).json({ message: "구글 인증에 실패했어요." });
      return;
    }

    next(err);
  }
};

export const refreshHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const refreshToken = req.cookies?.refreshToken as string | undefined;

    if (!refreshToken) {
      res
        .status(401)
        .json({ message: "토큰이 만료되었어요. 다시 로그인해 주세요." });
      return;
    }

    const accessToken = await refreshAccessToken(refreshToken);

    res.status(200).json({ accessToken });
  } catch (err: unknown) {
    next(err);
  }
};

export const logoutHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await logout(req.user!.userId);

    res.clearCookie("refreshToken", COOKIE_OPTIONS);

    res.status(200).json({ message: "로그아웃 되었어요." });
  } catch (err: unknown) {
    next(err);
  }
};
