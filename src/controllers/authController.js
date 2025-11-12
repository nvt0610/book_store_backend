import authService from "../services/authService.js";
import responseHelper from "../helpers/responseHelper.js";

const R = responseHelper;

const authController = {
    /** POST /api/auth/register */
    async register(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) return R.badRequest(res, "Missing email or password");

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
            if (!email || !password) return R.badRequest(res, "Missing email or password");

            const result = await authService.login(email, password);
            return R.ok(res, result, "Login successful");
        } catch (err) {
            console.error("[authController.login]", err);
            return R.error(res, err.status || 400, err.message);
        }
    },

    /** GET /api/auth/me */
    async getMe(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) return R.unauthorized(res, "Missing token context");

            const me = await authService.getMe(userId);
            if (!me) return R.notFound(res, "User not found");
            return R.ok(res, me, "Fetched current user");
        } catch (err) {
            console.error("[authController.getMe]", err);
            return R.internalError(res, err.message);
        }
    },

    /** PUT /api/auth/me */
    async updateProfile(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) return R.unauthorized(res, "Missing token context");

            const updated = await authService.updateProfile(userId, req.body);
            return R.ok(res, updated, "Profile updated successfully");
        } catch (err) {
            console.error("[authController.updateProfile]", err);
            return R.internalError(res, err.message);
        }
    },

    /** POST /api/auth/logout */
    async logout(req, res) {
        try {
            const userId = req.user?.id;
            const { refreshToken } = req.body;
            if (!userId || !refreshToken) return R.badRequest(res, "Missing refreshToken");

            const ok = await authService.logout(userId, refreshToken);
            if (!ok) return R.badRequest(res, "Session not found");
            return R.ok(res, { loggedOut: true }, "Logout successful");
        } catch (err) {
            console.error("[authController.logout]", err);
            return R.internalError(res, err.message);
        }
    },
    
    /** POST /api/auth/refresh */
    async refresh(req, res) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) return R.badRequest(res, "Missing refreshToken");
            const result = await authService.refreshToken(refreshToken);
            return R.ok(res, result, "Token refreshed successfully");
        } catch (err) {
            console.error("[authController.refresh]", err);
            return R.error(res, err.status || 401, err.message);
        }
    },
};

export default authController;
