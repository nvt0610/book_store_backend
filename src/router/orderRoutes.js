import express from "express";
import orderController from "../controllers/orderController.js";

const router = express.Router();

/**
 * Base route: /api/orders
 */
router.get("/", orderController.list);
router.get("/:id", orderController.getById);
router.get("/:id/items", orderController.listItems);

// Create orders
router.post("/", orderController.createManual);          // Manual (admin)
router.post("/from-cart", orderController.createFromCart); // From cart
router.post("/buy-now", orderController.buyNow);         // Instant / Buy now

// Update / Delete
router.patch("/:id", orderController.update);
router.delete("/:id", orderController.remove);

export default router;
