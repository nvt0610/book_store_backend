import express from "express";
import paymentController from "../controllers/paymentController.js";

const router = express.Router();

/**
 * Base route: /api/payments
 */
router.get("/", paymentController.list);
router.get("/:id", paymentController.getById);

// Create payment manually (admin only)
router.post("/", paymentController.create);

// Update or soft delete
router.patch("/:id", paymentController.update);
router.delete("/:id", paymentController.remove);

export default router;
