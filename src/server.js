import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import dotenv from "dotenv";
import db from "./db/db.js";
import routers from "./router/routers.js";
import errorHandler from "./middlewares/errorHandler.js";
import { authJWT } from "./middlewares/jwtAuth.js";
import { attachRequestContext } from "./middlewares/requestContext.js";
import { fileURLToPath } from "url";
import path from "path";
import config from "./config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(morgan("dev"));
app.disable("x-powered-by");

/**
 * Middleware order:
 * 1ï¸ authJWT â†’ decode token, attach req.user
 * 2ï¸ attachRequestContext â†’ push user_id vĂ o ALS
 */
app.use(authJWT);
app.use(attachRequestContext);
  
app.use("/img", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(path.join(__dirname, "public", "img")));

// API routes
app.use("/api", routers);

// Root check
app.get("/", (req, res) => {
  res.json({ success: true, message: "Bookstore API running" });
});

// 404 fallback
app.use((req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// Global error handler
app.use(errorHandler);

const PORT = config.app.port;
app.listen(PORT, async () => {
  try {
    await db.query("SELECT 1");
    console.log("Connected to PostgreSQL");
  } catch (err) {
    console.error("Database connection failed:", err.message);
  }
  console.log(`Server listening on http://localhost:${PORT}`);
});
