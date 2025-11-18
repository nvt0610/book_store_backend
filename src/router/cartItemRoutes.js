// src/routes/cartItemRoutes.js

import express from "express";
import cartItemController from "../controllers/cartItemController.js";

import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { requireCartOwnerOrAdmin } from "../middlewares/requireOwnerOrAdmin.js";

const router = express.Router();

/**
 * PUBLIC — guest + authenticated user
 * Guest must send guest_token
 * User must own the cart
 * Admin bypass
 */
router.post("/", requireCartOwnerOrAdmin("cart_id"), cartItemController.addItem);
router.patch("/:itemId", requireCartOwnerOrAdmin(null, "itemId"), cartItemController.updateQuantity);
router.delete("/:itemId", requireCartOwnerOrAdmin(null, "itemId"), cartItemController.removeItem);
router.delete("/", requireCartOwnerOrAdmin("cart_id"), cartItemController.clear);

/**
 * ADMIN ONLY
 */
router.use(requireAuth);
router.get("/", requireRole("ADMIN"), cartItemController.list);
router.get("/:itemId", requireRole("ADMIN"), cartItemController.getById);

export default router;
