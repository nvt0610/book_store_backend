import express from "express";
import orderItemController from "../controllers/orderItemController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = express.Router();

// ADMIN ONLY
router.use(requireAuth);
router.use(requireRole("ADMIN"));

router.get("/", orderItemController.list);
router.get("/:id", orderItemController.getById);
router.post("/", orderItemController.create);
router.put("/:id", orderItemController.update);
router.delete("/:id", orderItemController.remove);

export default router;
