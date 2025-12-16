// src/routes/paymentRoutes.js
import express from "express";
import paymentController from "../controllers/paymentController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { requireOwnerOrAdmin } from "../middlewares/requireOwnerOrAdmin.js";

const router = express.Router();

/** CUSTOMER + ADMIN */
router.use(requireAuth);

// ORDER
router.post(
  "/order/:order_id/complete",
  requireRole("ADMIN"),
  paymentController.markCompletedByOrder
);
router.post(
  "/order/:order_id/cancel",
  requireRole("ADMIN"),
  paymentController.cancelPendingByOrder
);
router.get(
  "/order/:order_id",
  requireOwnerOrAdmin("orders"),
  paymentController.listByOrder
);

// List all
router.get("/", paymentController.list);

// payment
router.post(
  "/order/:order_id/retry",
  requireAuth,
  requireOwnerOrAdmin("orders"),
  paymentController.retryPayment
);
router.get("/:id", requireOwnerOrAdmin("payments"), paymentController.getById);

/** ADMIN ONLY */
router.post("/", requireRole("ADMIN"), paymentController.create);
router.patch("/:id", requireRole("ADMIN"), paymentController.update);
router.delete("/:id", requireRole("ADMIN"), paymentController.remove);

export default router;
