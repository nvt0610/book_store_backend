// src/routes/authorRoutes.js

import express from "express";
import authorController from "../controllers/authorController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

/**
 * PUBLIC ROUTES
 */
router.get("/", authorController.list);
router.get("/:id", authorController.getById);

/**
 * ADMIN-ONLY ROUTES
 */
router.post("/", requireAuth, requireRole("ADMIN"), authorController.create);
router.put("/:id", requireAuth, requireRole("ADMIN"), authorController.update);
router.delete("/:id", requireAuth, requireRole("ADMIN"), authorController.remove);

export default router;
