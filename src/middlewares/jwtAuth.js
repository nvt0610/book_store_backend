// src/middlewares/jwtAuth.js

import jwtHelper from "../helpers/jwtHelper.js";

export function authJWT(req, res, next) {
  const header = req.headers["authorization"];

  // No token → treat as public request
  if (!header || !header.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = header.split(" ")[1];

  // Try verifying token
  const decoded = jwtHelper.verifyToken(token);

  // ⚠ Token existed but invalid → attach marker for invalid
  if (!decoded) {
    req.user = { invalid: true };
    return next();
  }

  // Valid token → attach user
  req.user = {
    id: decoded.sub || decoded.user_id || decoded.id,
    role: decoded.role || "CUSTOMER",
    exp: decoded.exp,
  };

  return next();
}
