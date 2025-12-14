import responseHelper from "../helpers/responseHelper.js";

export function requireSelfOrAdmin(paramName = "id") {
  return async (req, res, next) => {
    const user = req.user;
    const targetId = req.params[paramName];

    // Admin bypass
    if (user.role === "ADMIN") {
      return next();
    }

    // Customer → chỉ chỉnh chính mình
    if (user.id === targetId) {
      return next();
    }

    return responseHelper.forbidden(
      res,
      "Forbidden: You can only modify your own account"
    );
  };
}
