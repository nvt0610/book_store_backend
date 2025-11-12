import { AsyncLocalStorage } from "async_hooks";

export const requestContext = new AsyncLocalStorage();

/**
 * Middleware: attach per-request context (userId, role)
 */
export function attachRequestContext(req, res, next) {
  const context = {
    userId: req.user?.id || req.user?.user_id || null,
    role: req.user?.role || "GUEST",
  };
  requestContext.run(context, () => next());
}

/**
 * Helper: get current request context
 */
export function getRequestContext() {
  return requestContext.getStore() || {};
}
