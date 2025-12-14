import express from "express";
import searchController from "../controllers/searchController.js";

const router = express.Router();

// Public
router.get("/", searchController.search);

export default router;
