import jwtHelper from "../helpers/jwtHelper.js";

/**
 * Middleware to verify JWT and attach decoded user to req.user
 */
export function authJWT(req, res, next) {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = header.split(" ")[1];
  const decoded = jwtHelper.verifyToken(token);

  if (!decoded) {
    req.user = null;
    return next();
  }

  req.user = {
    id: decoded.user_id || decoded.sub || decoded.id || null,
    role: decoded.role || "CUSTOMER",
    exp: decoded.exp,
  };

  return next();
}
