import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../../utils/AppError.js";

export const createAccessToken = (data: Record<string, any>): string => {
    return jwt.sign(data, env.JWT_SECRET_KEY, {
        expiresIn: Number(env.ACCESS_TOKEN_EXPIRE_MINUTES) * 60,
    });
};

export const createRefreshToken = (data: Record<string, any>): string => {
    return jwt.sign({ ...data, type: "refresh" }, env.JWT_SECRET_KEY, {
        expiresIn: Number(env.REFRESH_TOKEN_EXPIRE_DAYS) * 24 * 60 * 60,
    });
};

export const verifyToken = (token: string): Record<string, any> => {
    try {
        return jwt.verify(token, env.JWT_SECRET_KEY) as Record<string, any>;
    } catch (err) {
        throw new AppError(401, "유효하지 않은 토큰이에요.");
    }
};
