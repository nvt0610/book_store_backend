// src/routes/orderRoutes.js

import express from "express";
import orderController from "../controllers/orderController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { requireOwnerOrAdmin } from "../middlewares/requireOwnerOrAdmin.js";

const router = express.Router();

/**
 * CUSTOMER + ADMIN
 */
// CUSTOMER + ADMIN
router.use(requireAuth);

// Customer checkout
router.post("/from-cart", orderController.createFromCart);
router.post("/buy-now", orderController.buyNow);

// List (admin: all, customer: own)
router.get("/", orderController.list);

// Get order detail
router.get("/:id", requireOwnerOrAdmin("orders"), orderController.getById);

// Get items
router.get("/:id/items", requireOwnerOrAdmin("orders"), orderController.listItems);

// Cancel
router.patch("/:id/cancel", requireOwnerOrAdmin("orders"), orderController.cancel);

// ADMIN ONLY
router.post("/", requireRole("ADMIN"), orderController.createManual);
router.patch("/:id", requireRole("ADMIN"), orderController.update);
router.delete("/:id", requireRole("ADMIN"), orderController.remove);

export default router;
