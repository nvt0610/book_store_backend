import authService from "../services/authService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const authController = {
  /** POST /api/auth/register */
  async register(req, res) {
    try {
      const { email, password } = req.body;

      try {
        validate.required(email, "email");
        validate.required(password, "password");
        validate.email(email);
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      // Clean input
      req.body.email = validate.trimString(email, "email");

      const user = await authService.register(req.body);
      return R.created(res, user, "User registered successfully");
    } catch (err) {
      console.error("[authController.register]", err);
      return R.error(res, err.status || 400, err.message);
    }
  },

  /** POST /api/auth/login */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      try {
        validate.required(email, "email");
        validate.required(password, "password");
        validate.email(email);
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const cleanEmail = validate.trimString(email, "email");

      const result = await authService.login(cleanEmail, password);
      return R.ok(res, result, "Login successful");
    } catch (err) {
      console.error("[authController.login]", err);
      return R.error(res, err.status || 400, err.message);
    }
  },

  /** GET /api/auth/me */
  async getMe(req, res) {
    try {
      const user_id = req.user?.id;
      if (!user_id) return R.unauthorized(res, "Missing token context");

      const me = await authService.getMe(user_id);
      return me
        ? R.ok(res, me, "Fetched current user")
        : R.notFound(res, "User not found");

    } catch (err) {
      console.error("[authController.getMe]", err);
      return R.internalError(res, err.message);
    }
  },

  /** PUT /api/auth/me */
  async updateProfile(req, res) {
    try {
      const user_id = req.user?.id;
      if (!user_id) return R.unauthorized(res, "Missing token context");

      const body = req.body;

      // Clean optional text fields
      if (body.full_name)
        body.full_name = validate.trimString(body.full_name, "full_name");

      if (body.phone)
        body.phone = validate.trimString(body.phone, "phone");

      const updated = await authService.updateProfile(user_id, body);
      return R.ok(res, updated, "Profile updated successfully");

    } catch (err) {
      console.error("[authController.updateProfile]", err);
      return R.internalError(res, err.message);
    }
  },

  /** POST /api/auth/logout */
  async logout(req, res) {
    try {
      const user_id = req.user?.id;
      const { refreshToken } = req.body;

      try {
        validate.required(refreshToken, "refreshToken");
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const ok = await authService.logout(user_id, refreshToken);
      return ok
        ? R.ok(res, { loggedOut: true }, "Logout successful")
        : R.badRequest(res, "Session not found");

    } catch (err) {
      console.error("[authController.logout]", err);
      return R.internalError(res, err.message);
    }
  },

  /** POST /api/auth/refresh */
  async refresh(req, res) {
    try {
      const { refreshToken } = req.body;

      try {
        validate.required(refreshToken, "refreshToken");
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const result = await authService.refreshToken(refreshToken);
      return R.ok(res, result, "Token refreshed successfully");

    } catch (err) {
      console.error("[authController.refresh]", err);
      return R.error(res, err.status || 401, err.message);
    }
  },
};

export default authController;
