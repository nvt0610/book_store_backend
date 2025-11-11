import express from "express";
import publisherController from "../controllers/publisherController.js";

const router = express.Router();

// GET /api/publishers
router.get("/", publisherController.list);

// GET /api/publishers/:id
router.get("/:id", publisherController.getById);

// POST /api/publishers
router.post("/", publisherController.create);

// PUT /api/publishers/:id
router.put("/:id", publisherController.update);

// DELETE /api/publishers/:id
router.delete("/:id", publisherController.remove);

export default router;
