import { Request, Response } from "express";

/**
 * 비회원 무료 상담 잔여 횟수 조회 컨트롤러 (제한 해제)
 */
export function getGuestQuota(req: Request, res: Response) {
  res.status(200).json({
    remainingQuota: 9999,
    maxQuota: 9999,
    isExceeded: false,
  });
}
