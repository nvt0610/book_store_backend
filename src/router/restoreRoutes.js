// src/routes/restoreRoutes.js
import express from "express";
import restoreController from "../controllers/restoreController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

/**
 * POST /api/restore
 * body: { table: "products", id: "uuid" }
 */
router.post("/", requireAuth, requireRole("ADMIN"), restoreController.restore);

export default router;
