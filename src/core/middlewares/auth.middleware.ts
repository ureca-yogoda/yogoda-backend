import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../security/jwt.js";
import { UserModel } from "../../models/user.model.js";
import { AppError } from "../../utils/AppError.js";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError(401, "인증이 필요해요.");
  }

  const token = authHeader.split(" ")[1];
  const payload = verifyToken(token);
  const userId = payload.userId;

  if (!userId) {
    throw new AppError(401, "유효하지 않은 토큰이에요.");
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError(404, "유저를 찾을 수 없어요.");
  }

  req.user = {
    userId: user._id.toString(),
    nickname: user.nickname,
    role: user.role,
  };
  next();
};

export const adminMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (req.user?.role !== "admin") {
    throw new AppError(403, "관리자만 접근할 수 있어요.");
  }

  next();
};
