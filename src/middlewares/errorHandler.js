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
  // Nếu response đã gửi, bỏ qua
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  const env = process.env.NODE_ENV || "development";

  // Chuẩn hóa body JSON
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

  // Gắn thêm chi tiết lỗi nếu đang ở môi trường dev
  if (env === "development") {
    errorResponse.error.stack = err.stack;
    if (err.detail) errorResponse.error.detail = err.detail;
  }

  // Log lỗi ra console
  console.error(
    `[ERROR] ${req.method} ${req.originalUrl} (${status}) →`,
    err.message
  );

  res.status(status).json(errorResponse);
}
