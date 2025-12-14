/**
 * @module middlewares/errorHandler
 * Centralized Express error-handling middleware.
 * 
 * Features:
 * - Catches all thrown or unhandled errors.
 * - Formats error response JSON consistently.
 * - Hides stack traces in production.
 * - Supports custom error.status and error.code fields.
 */

export default function errorHandler(err, req, res, next) {
  // Náº¿u response Ä‘Ă£ gá»­i, bá» qua
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  const env = process.env.NODE_ENV || "development";

  // Chuáº©n hĂ³a body JSON
  const errorResponse = {
    success: false,
    status,
    error: {
      message:
        err.message ||
        (status === 404
          ? "Resource not found"
          : "Internal server error"),
    },
  };

  // Gáº¯n thĂªm chi tiáº¿t lá»—i náº¿u Ä‘ang á»Ÿ mĂ´i trÆ°á»ng dev
  if (env === "development") {
    errorResponse.error.stack = err.stack;
    if (err.detail) errorResponse.error.detail = err.detail;
  }

  // Log lá»—i ra console
  console.error(
    `[ERROR] ${req.method} ${req.originalUrl} (${status}) â†’`,
    err.message
  );

  res.status(status).json(errorResponse);
}
