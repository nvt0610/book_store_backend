// src/middlewares/requireAuth.js

import responseHelper from "../helpers/responseHelper.js";

/**
 * Middleware: Require authenticated user.
 *
 * This middleware assumes `authJWT` has already parsed the access token
 * and populated `req.user = { id, role, exp }` or null if the token is missing/invalid.
 *
 * If no authenticated user is present, the request is blocked with a standardized response.
 */
export function requireAuth(req, res, next) {
    if (req.user?.invalid) return responseHelper.unauthorized(res, "Invalid token");

    // If JWT was missing or invalid, authJWT sets req.user = null
    if (!req.user || !req.user.id) {
        return responseHelper.unauthorized(
            res,
            "Unauthorized: valid access token required"
        );
    }

    // Optional: token expiration is already validated inside jwt.verify() in authJWT
    return next();
}
