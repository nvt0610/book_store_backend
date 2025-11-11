import express from "express";
import cartController from "../controllers/cartController.js";

const router = express.Router();

router.get("/", cartController.list);
router.get("/:id", cartController.getById);
router.post("/", cartController.create);
router.put("/:id", cartController.update);
router.delete("/:id", cartController.remove);

export default router;
