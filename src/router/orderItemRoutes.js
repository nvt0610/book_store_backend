import express from "express";
import orderItemController from "../controllers/orderItemController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

router.use(requireAuth);

// ADMIN ONLY ROUTES
router.get("/", requireRole("ADMIN"), orderItemController.list);
router.get("/:id", requireRole("ADMIN"), orderItemController.getById);
router.post("/", requireRole("ADMIN"), orderItemController.create);
router.put("/:id", requireRole("ADMIN"), orderItemController.update);
router.delete("/:id", requireRole("ADMIN"), orderItemController.remove);

export default router;
