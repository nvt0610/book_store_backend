import express from "express";
import { upload } from "../middlewares/uploadMiddleware.js";
import uploadController from "../controllers/uploadController.js";

const router = express.Router();

// ===== Upload single image =====
router.post(
  "/single",
  upload.single("file"),
  uploadController.uploadSingle
);

// ===== Upload multiple images =====
router.post(
  "/multiple",
  upload.array("files", 5),
  uploadController.uploadMultiple
);

export default router;
