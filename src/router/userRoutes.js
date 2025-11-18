// src/routes/userRoutes.js
import express from "express";
import userController from "../controllers/userController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// ===== ADMIN-ONLY (manage users) =====
router.use(requireAuth);
router.use(requireRole("ADMIN"));

router.get("/", userController.list);
router.get("/:id", userController.getById);
router.post("/", userController.create);
router.put("/:id", userController.update);
router.delete("/:id", userController.remove);

export default router;
