import { Router } from "express";

import {
  cancelCurrentPlanHandler,
  changePlanHandler,
  getComparedPlansHandler,
  getCurrentPlanHandler,
  getPlanByCodeHandler,
  getPlansHandler,
  joinPlanHandler,
} from "../controllers/plan.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/", getPlansHandler);
router.get("/me/compare", authMiddleware, getComparedPlansHandler);

/*
 * 현재 로그인한 사용자의 가입 요금제를 조회함
 * 동적 라우트보다 먼저 선언해서 "me"가 요금제 코드로 처리되지 않도록 함
 */
router.get("/me/current", authMiddleware, getCurrentPlanHandler);
router.delete("/me/current", authMiddleware, cancelCurrentPlanHandler);

router.post("/:code/join", authMiddleware, joinPlanHandler);

/*
 * 현재 이용 중인 요금제를 다른 요금제로 변경함
 */
router.patch("/:code/change", authMiddleware, changePlanHandler);

router.get("/:code", getPlanByCodeHandler);

export default router;
