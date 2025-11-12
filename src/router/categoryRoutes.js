import express from "express";
import categoryController from "../controllers/categoryController.js";

const router = express.Router();

// ===== CRUD =====
router.get("/", categoryController.list);
router.get("/:id", categoryController.getById);
router.post("/", categoryController.create);
router.put("/:id", categoryController.update);
router.delete("/:id", categoryController.remove);

// ===== Category-Product relation =====
router.post("/:id/products", categoryController.addProducts);
router.delete("/:id/products", categoryController.removeProducts);

export default router;
