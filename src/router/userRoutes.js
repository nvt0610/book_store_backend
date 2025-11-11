import express from "express";
import userController from "../controllers/userController.js";

/**
 * User routes definition.
 * All endpoints are prefixed with /api/users in main router.
 */
const router = express.Router();

// GET /api/users
router.get("/", userController.list);

// GET /api/users/:id
router.get("/:id", userController.getById);

// POST /api/users
router.post("/", userController.create);

// PUT /api/users/:id
router.put("/:id", userController.update);

// DELETE /api/users/:id
router.delete("/:id", userController.remove);

export default router;
