import { Router } from "express";

import {
  addMySubscriptionHandler,
  cancelMySubscriptionHandler,
  getMySubscriptionsHandler,
  updateMySubscriptionHandler,
} from "../controllers/subscription.controller.js";
import { authMiddleware } from "../../core/middlewares/auth.middleware.js";

const router = Router();

router.get("/me", authMiddleware, getMySubscriptionsHandler);
router.post("/me", authMiddleware, addMySubscriptionHandler);
router.patch(
  "/me/:subscriptionId",
  authMiddleware,
  updateMySubscriptionHandler,
);
router.delete(
  "/me/:subscriptionId",
  authMiddleware,
  cancelMySubscriptionHandler,
);

export default router;
