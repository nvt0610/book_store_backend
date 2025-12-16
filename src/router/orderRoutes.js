import express from "express";
import orderController from "../controllers/orderController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { requireOwnerOrAdmin } from "../middlewares/requireOwnerOrAdmin.js";

const router = express.Router();

// CUSTOMER + ADMIN
router.post("/from-cart", requireAuth, orderController.createFromCart);
router.post("/buy-now", requireAuth, orderController.buyNow);
router.post("/buy-again", requireAuth, orderController.buyAgain);
router.get("/", requireAuth, orderController.list);

router.get("/:id", requireAuth, requireOwnerOrAdmin("orders"), orderController.getById);
router.get("/:id/items", requireAuth, requireOwnerOrAdmin("orders"), orderController.listItems);
router.patch("/:id/cancel", requireAuth, requireOwnerOrAdmin("orders"), orderController.cancel);

// ADMIN ONLY
router.post("/manual", requireAuth, requireRole("ADMIN"), orderController.createManual);
router.put("/:id", requireAuth, requireRole("ADMIN"), orderController.update);
router.delete("/:id", requireAuth, requireRole("ADMIN"), orderController.remove);

export default router;
