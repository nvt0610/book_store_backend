import express from "express";
import cartController from "../controllers/cartController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { requireOwnerOrAdmin } from "../middlewares/requireOwnerOrAdmin.js";

const router = express.Router();

/**
 * PUBLIC for guest
 */
router.post("/guest", cartController.getOrCreateGuest);
router.post("/merge", requireAuth, cartController.mergeGuestToUser);

/**
 * CUSTOMER + ADMIN
 */
router.use(requireAuth);

// User gets own cart — USE TOKEN
router.get("/me", cartController.getMyCart);

// Admin or user (owner) get cart by ID
router.get("/:id", requireOwnerOrAdmin("carts"), cartController.getById);

/**
 * ADMIN ONLY
 */
router.get("/", requireRole("ADMIN"), cartController.list);
router.post("/", requireRole("ADMIN"), cartController.create);
router.put("/:id", requireRole("ADMIN"), cartController.update);
router.delete("/:id", requireRole("ADMIN"), cartController.remove);

export default router;
