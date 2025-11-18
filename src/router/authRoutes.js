import express from "express";
import authController from "../controllers/authController.js";
import { authJWT } from "../middlewares/jwtAuth.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

/**
 * Base path: /api/auth
 */
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", requireAuth, authController.logout);
router.post("/refresh", authController.refresh);

router.get("/me", requireAuth, authController.getMe);
router.put("/me", requireAuth, authController.updateProfile);

export default router;
