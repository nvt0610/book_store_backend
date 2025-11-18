// src/routes/publisherRoutes.js
import express from "express";
import publisherController from "../controllers/publisherController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// ===== Public GET =====
router.get("/", publisherController.list);
router.get("/:id", publisherController.getById);

// ===== Admin-only =====
router.post(
    "/",
    requireAuth,
    requireRole("ADMIN"),
    publisherController.create
);

router.put(
    "/:id",
    requireAuth,
    requireRole("ADMIN"),
    publisherController.update
);

router.delete(
    "/:id",
    requireAuth,
    requireRole("ADMIN"),
    publisherController.remove
);

export default router;
