import express from "express";
import authController from "../controllers/authController.js";
import { authJWT } from "../middlewares/jwtAuth.js";

const router = express.Router();

/**
 * Base path: /api/auth
 */
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authJWT, authController.logout);
router.post("/refresh", authController.refresh);

router.get("/me", authJWT, authController.getMe);
router.put("/me", authJWT, authController.updateProfile);

export default router;
