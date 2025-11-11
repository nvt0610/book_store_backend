import express from "express";
import orderController from "../controllers/orderController.js";

const router = express.Router();

/**
 * /api/orders
 */
router.get("/", orderController.list);
router.get("/:id", orderController.getById);
router.get("/:id/items", orderController.listItems);

// Create paths:
router.post("/", orderController.createAdmin);        // Admin tạo đơn thủ công (items[])
router.post("/from-cart", orderController.createFromCart); // Checkout từ cart
router.post("/buy-now", orderController.buyNow);     // Mua nhanh 1 sản phẩm

router.patch("/:id", orderController.update);
router.delete("/:id", orderController.remove);

export default router;
