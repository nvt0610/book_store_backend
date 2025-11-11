import express from "express";
import orderItemController from "../controllers/orderItemController.js";

const router = express.Router();

router.get("/", orderItemController.list);
router.get("/:id", orderItemController.getById);
router.post("/", orderItemController.create);
router.put("/:id", orderItemController.update);
router.delete("/:id", orderItemController.remove);

export default router;
