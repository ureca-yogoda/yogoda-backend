import { Router } from "express";

import {
  getBenefitHandler,
  getBenefitsHandler,
  getNearbyBenefitsHandler,
  getSavedBenefitsHandler,
  removeSavedBenefitHandler,
  saveBenefitHandler,
} from "../controllers/benefit.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/", authMiddleware, getBenefitsHandler);
router.get("/nearby", authMiddleware, getNearbyBenefitsHandler);
router.get("/saved/me", authMiddleware, getSavedBenefitsHandler);
router.put("/:code/saved", authMiddleware, saveBenefitHandler);
router.delete("/:code/saved", authMiddleware, removeSavedBenefitHandler);
router.get("/:code", authMiddleware, getBenefitHandler);

export default router;
