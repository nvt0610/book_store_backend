import express from "express";
import productController from "../controllers/productController.js";

const router = express.Router();

// GET /api/products
router.get("/", productController.list);

// GET /api/products/:id
router.get("/:id", productController.getById);

// POST /api/products
router.post("/", productController.create);

// PUT /api/products/:id
router.put("/:id", productController.update);

// DELETE /api/products/:id  (soft delete → status = INACTIVE)
router.delete("/:id", productController.remove);

export default router;
