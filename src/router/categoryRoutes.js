import express from "express";
import categoryController from "../controllers/categoryController.js";

const router = express.Router();

// GET /api/categories
router.get("/", categoryController.list);

// GET /api/categories/:id
router.get("/:id", categoryController.getById);

// POST /api/categories
router.post("/", categoryController.create);

// PUT /api/categories/:id
router.put("/:id", categoryController.update);

// DELETE /api/categories/:id  (soft delete)
router.delete("/:id", categoryController.remove);

export default router;
