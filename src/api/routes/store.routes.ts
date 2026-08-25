import { Router } from "express";

import {
  getStoreByCodeHandler,
  getStoresHandler,
} from "../controllers/store.controller.js";

const router = Router();

router.get("/", getStoresHandler);
router.get("/:code", getStoreByCodeHandler);

export default router;
