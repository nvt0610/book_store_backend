import express from "express";
import vnpayController from "../controllers/vnpayController.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = express.Router();

/**
 * Create payment URL: must be authenticated (customer/admin)
 */
router.post("/create", requireAuth, vnpayController.create);

/**
 * IPN + Return: must be public (NO requireAuth)
 * NOTE: you still must bypass authJWT middleware (global) in jwtAuth.js
 */
router.get("/ipn", vnpayController.ipn);
router.get("/return", vnpayController.returnUrl);

export default router;
