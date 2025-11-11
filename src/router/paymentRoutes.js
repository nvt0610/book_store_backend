import express from "express";
import paymentController from "../controllers/paymentController.js";

const router = express.Router();

router.get("/", paymentController.list);
router.get("/:id", paymentController.getById);
router.post("/", paymentController.create);
router.put("/:id", paymentController.update);
router.delete("/:id", paymentController.remove);

export default router;
