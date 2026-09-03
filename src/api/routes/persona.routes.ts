import { Router } from "express";

import { analyzePersonaHandler } from "../controllers/persona.controller.js";

const router = Router();

// 로그인 전 온보딩에서도 사용할 수 있는 공개 분석 API입니다.
router.post("/analyze", analyzePersonaHandler);

export default router;
