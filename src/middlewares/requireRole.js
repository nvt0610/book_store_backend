// src/middlewares/requireRole.js

import responseHelper from "../helpers/responseHelper.js";

/**
 * Role-based authorization middleware.
 *
 * This middleware assumes:
 * - authJWT has already parsed the access token
 * - req.user contains { id, role, exp }
 * - requireAuth has validated that the user is logged in
 *
 * Usage:
 *   router.get("/admin", requireAuth, requireRole("ADMIN"), controller.admin);
 *   router.post("/staff", requireAuth, requireRole("ADMIN", "STAFF"), controller.doStuff);
 *
 * If the user's role is not included in allowedRoles → respond with 403.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // Ensure req.user exists
    if (!req.user || !req.user.role) {
      return responseHelper.unauthorized(
        res,
        "Unauthorized: missing user information"
      );
    }

    const userRole = req.user.role;

    // Check whether the user role is allowed
    const isAllowed = allowedRoles.includes(userRole);

    if (!isAllowed) {
      return responseHelper.forbidden(res, "Forbidden: insufficient permissions", {
        required_roles: allowedRoles,
        user_role: userRole,
      });
    }

    return next();
  };
}
