import express from "express";
import cartItemController from "../controllers/cartItemController.js";

const router = express.Router();

router.get("/", cartItemController.list);
router.get("/:id", cartItemController.getById);
router.post("/", cartItemController.create);
router.put("/:id", cartItemController.update);
router.delete("/:id", cartItemController.remove);

export default router;
