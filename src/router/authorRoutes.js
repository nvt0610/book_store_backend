import express from "express";
import authorController from "../controllers/authorController.js";

const router = express.Router();

// GET /api/authors
router.get("/", authorController.list);

// GET /api/authors/:id
router.get("/:id", authorController.getById);

// POST /api/authors
router.post("/", authorController.create);

// PUT /api/authors/:id
router.put("/:id", authorController.update);

// DELETE /api/authors/:id
router.delete("/:id", authorController.remove);

export default router;
