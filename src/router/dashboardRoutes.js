import express from "express";
import dashboardController from "../controllers/dashboardController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// Admin-only summary
router.get(
  "/summary",
  requireAuth,
  requireRole("ADMIN"),
  dashboardController.getSummary
);

export default router;
