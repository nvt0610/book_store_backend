import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import dotenv from "dotenv";
import db from "./db/db.js";
import routers from "./router/routers.js";
import errorHandler from "./middlewares/errorHandler.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(morgan("dev"));

app.disable("x-powered-by");

// Register all routes
app.use("/api", routers);

// Default root endpoint
app.get("/", (req, res) => {
  res.json({ success: true, message: "Bookstore API running" });
});

app.use((req, res, next) => {
  const err = new Error("Not Found");
  err.status = 404;
  next(err);
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    await db.query("SELECT 1");
    console.log(`Connected to PostgreSQL`);
  } catch (err) {
    console.error("Database connection failed:", err.message);
  }
  console.log(`Server listening on http://localhost:${PORT}`);
});
