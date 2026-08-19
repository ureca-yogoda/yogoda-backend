import { Router } from "express";

import {
  getPlanByCodeHandler,
  getPlansHandler,
} from "../controllers/plan.controller.js";

const router = Router();

router.get("/", getPlansHandler);
router.get("/:code", getPlanByCodeHandler);

export default router;
