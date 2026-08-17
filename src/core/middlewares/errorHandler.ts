import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../../utils/AppError.js";

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    console.error(err);

    // Zod 검증 에러
    if (err instanceof ZodError) {
        res.status(422).json({
            message: "요청 데이터가 올바르지 않아요.",
            errors: err.issues,
        });
        return;
    }

    if (err instanceof AppError) {
        res.status(err.statusCode).json({ message: err.message });
        return;
    }

    // 그 외 예상 못 한 에러 — 프로덕션에서는 내부 정보 노출 방지
    const status = 500;
    res.status(status).json({
        message:
            env.NODE_ENV === "development"
                ? err.message || "Internal Server Error"
                : "Internal Server Error",
        ...(env.NODE_ENV === "development" && { stack: err.stack }),
    });
};
