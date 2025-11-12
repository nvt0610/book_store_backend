import express from "express";
import userRoutes from "./userRoutes.js";
import authorRoutes from "./authorRoutes.js";
import publisherRoutes from "./publisherRoutes.js";
import productRoutes from "./productRoutes.js";
import categoryRoutes from "./categoryRoutes.js";
import addressRoutes from "./addressRoutes.js";
import cartRoutes from "./cartRoutes.js";
import cartItemRoutes from "./cartItemRoutes.js";
import orderRoutes from "./orderRoutes.js";
import orderItemRoutes from "./orderItemRoutes.js";
import paymentRoutes from "./paymentRoutes.js";
import authRoutes from "./authRoutes.js";
import uploadRoutes from "./uploadRoutes.js";

/**
 * Main router entry point.
 * This file combines all feature routes and exports a single router instance.
 */
const router = express.Router();

// Base path for all API modules
router.use("/users", userRoutes);
router.use("/authors", authorRoutes);
router.use("/publishers", publisherRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/addresses", addressRoutes);
router.use("/carts", cartRoutes);
router.use("/cart-items", cartItemRoutes);
router.use("/orders", orderRoutes);
router.use("/order-items", orderItemRoutes);
router.use("/payments", paymentRoutes);
router.use("/auth", authRoutes);
router.use("/upload", uploadRoutes);

// Health check endpoint for quick testing
router.get("/health", (req, res) => {
  res.status(200).json({ success: true, message: "API is healthy" });
});

export default router;
