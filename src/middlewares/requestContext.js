/**
 * @module middlewares/requestContext
 * Middleware for managing per-request context using AsyncLocalStorage.
 * Stores requestId, user information, and role for downstream services.
 */

import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

/**
 * Global AsyncLocalStorage instance used to maintain
 * request-scoped context across asynchronous operations.
 */
export const requestContext = new AsyncLocalStorage();

/**
 * Middleware: Attach a per-request context (requestId, user, user_id, role)
 * and make it available for all subsequent operations via AsyncLocalStorage.
 *
 * @param {import("express").Request} req - Express request object
 * @param {import("express").Response} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function attachRequestContext(req, res, next) {
  // Retrieve existing context if previous middlewares have set one
  const existing = requestContext.getStore() || {};

  // Build a new context object for this request
  const context = {
    /**
     * Unique request identifier.
     * Priority:
     *   1) existing.requestId (if already set by earlier middleware)
     *   2) "x-request-id" header
     *   3) auto-generated UUID
     */
    requestId:
      existing.requestId ||
      req.headers["x-request-id"] ||
      randomUUID(),

    /** Full user object decoded from JWT (if available) */
    user: req.user || null,

    /**
     * User identifier (normalized)
     * Supports both id and user_id for flexibility.
     */
    user_id: req.user?.id || req.user?.user_id || null,

    /**
     * User role for permission checks.
     * Defaults to "GUEST" if unauthenticated.
     */
    role: req.user?.role || "GUEST",
  };

  // Run the next middleware inside the context
  requestContext.run(context, () => next());
}

/**
 * Get the current request-scoped context.
 *
 * @returns {Object} The current context (requestId, user, user_id, role),
 * or an empty object if no context exists.
 */
export function getRequestContext() {
  return requestContext.getStore() || {};
}
