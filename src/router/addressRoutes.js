// src/routes/addressRoutes.js

import express from "express";
import addressController from "../controllers/addressController.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireOwnerOrAdmin } from "../middlewares/requireOwnerOrAdmin.js";

const router = express.Router();

router.use(requireAuth);

// User + Admin
router.get("/",  requireAuth, addressController.list);
router.get("/:id", requireAuth, requireOwnerOrAdmin("addresses"), addressController.getById);
router.post("/", requireAuth, addressController.create);
router.put("/:id", requireAuth, requireOwnerOrAdmin("addresses"), addressController.update);
router.patch("/:id/set-default", requireAuth, requireOwnerOrAdmin("addresses"), addressController.setDefault);
router.delete("/:id", requireAuth, requireOwnerOrAdmin("addresses"), addressController.remove);

export default router;
