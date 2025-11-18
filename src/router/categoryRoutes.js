import express from "express";
import categoryController from "../controllers/categoryController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// ===== Public =====
router.get("/", categoryController.list);
router.get("/:id", categoryController.getById);

// ===== Admin only =====
router.post(
    "/",
    requireAuth,
    requireRole("ADMIN"),
    categoryController.create
);

router.put(
    "/:id",
    requireAuth,
    requireRole("ADMIN"),
    categoryController.update
);

router.delete(
    "/:id",
    requireAuth,
    requireRole("ADMIN"),
    categoryController.remove
);

// ===== Category-Product relation (Admin only) =====
router.post(
    "/:id/products",
    requireAuth,
    requireRole("ADMIN"),
    categoryController.addProducts
);

router.delete(
    "/:id/products",
    requireAuth,
    requireRole("ADMIN"),
    categoryController.removeProducts
);

export default router;
