// src/routes/productRoutes.js
import express from "express";
import productController from "../controllers/productController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// ===== Public endpoints =====
router.get("/", productController.list);
router.get("/:id", productController.getById);

// ===== Admin-only endpoints =====
router.post(
    "/",
    requireAuth,
    requireRole("ADMIN"),
    productController.create
);

router.put(
    "/:id",
    requireAuth,
    requireRole("ADMIN"),
    productController.update
);

router.delete(
    "/:id",
    requireAuth,
    requireRole("ADMIN"),
    productController.remove
);

export default router;
