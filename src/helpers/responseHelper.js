/**
 * @module helpers/responseHelper
 * Provides standardized HTTP response utilities for controllers.
 * Simplified: no statusCode field inside body (already in HTTP header).
 */

/**
 * Build a uniform response body.
 * @param {boolean} success
 * @param {string} message
 * @param {any} [data]
 * @returns {{ success: boolean, message: string, data?: any, timestamp: string }}
 */
function buildResponse(success, message, data) {
  const response = {
    success,
    message,
    timestamp: new Date().toISOString(),
  };
  if (data !== undefined && data !== null) {
    response.data = data;
  }
  return response;
}

/**
 * Send a standardized JSON response.
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {boolean} success
 * @param {string} message
 * @param {any} [data]
 */
function send(res, statusCode, success, message, data) {
  return res.status(statusCode).json(buildResponse(success, message, data));
}

export const responseHelper = {
  ok(res, data = null, message = "OK") {
    return send(res, 200, true, message, data);
  },

  created(res, data = null, message = "Created") {
    return send(res, 201, true, message, data);
  },

  noContent(res, message = "No Content") {
    return send(res, 204, true, message);
  },

  badRequest(res, message = "Bad Request", data = null) {
    return send(res, 400, false, message, data);
  },

  unauthorized(res, message = "Unauthorized", data = null) {
    return send(res, 401, false, message, data);
  },

  forbidden(res, message = "Forbidden", data = null) {
    return send(res, 403, false, message, data);
  },

  notFound(res, message = "Not Found", data = null) {
    return send(res, 404, false, message, data);
  },

  conflict(res, message = "Conflict", data = null) {
    return send(res, 409, false, message, data);
  },

  internalError(res, message = "Internal Server Error", data = null) {
    return send(res, 500, false, message, data);
  },

  serviceUnavailable(res, message = "Service Unavailable", data = null) {
    return send(res, 503, false, message, data);
  },

  handleError(res, error, fallbackMessage = "Internal Server Error") {
    console.error("[responseHelper] Error:", error);

    if (error.code === "23505") {
      return send(res, 409, false, "Conflict: Duplicate entry", { detail: error.detail });
    }

    const message = error.message || fallbackMessage;
    const data = process.env.NODE_ENV === "production" ? undefined : { stack: error.stack };
    return send(res, 500, false, message, data);
  },
};

export default responseHelper;
