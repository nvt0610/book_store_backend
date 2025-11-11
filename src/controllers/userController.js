import userService from "../services/userService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

/**
 * Controller layer for handling HTTP requests related to users.
 * - Delegates business logic to the service layer
 * - Handles request parsing, response formatting, and error handling
 */
const userController = {
    /**
     * Handle GET /users
     * Supports query parameters:
     *   ?q=searchText
     *   ?sortBy=email&sortDir=ASC
     *   ?page=2&pageSize=10
     *   ?filters[0][field]=status&filters[0][op]=eq&filters[0][value]=ACTIVE
     */
    async list(req, res) {
        try {
            const queryParams = {
                ...req.query,
                filters: req.query.filters || [],
                sortBy: req.query.sortBy,
                sortDir: req.query.sortDir,
                q: req.query.q,
                page: req.query.page,
                pageSize: req.query.pageSize,
                showDeleted: req.query.showDeleted || "active",
            };

            const result = await userService.listUsers(queryParams);
            return R.ok(res, result, "Fetched users successfully");
        } catch (error) {
            console.error("listUsers error:", error);
            return R.internalError(res, error.message);
        }
    },

    /**
     * Handle GET /users/:id
     * Fetch details of a single user by ID.
     */
    async getById(req, res) {
        try {
            const { id } = req.params;
            const showDeleted = req.query.showDeleted || "active";
            const user = await userService.getUserById(id, showDeleted);
            if (!user) return R.notFound(res, "User not found");
            return R.ok(res, user, "Fetched user successfully");
        } catch (error) {
            console.error("getUserById error:", error);
            return R.internalError(res, error.message);
        }
    },

    /**
     * Handle POST /users
     * Create a new user record.
     * Body required: { full_name, email, password, phone?, role? }
     */
    async create(req, res) {
        try {
            const body = req.body;
            if (!body.email || !body.password || (!body.full_name && !body.first_name && !body.last_name)) {
                return R.badRequest(res, "Missing required fields: name, email, password");
            }

            const user = await userService.createUser(body);
            return R.created(res, user, "User created successfully");
        } catch (error) {
            console.error("createUser error:", error);
            if (error.code === "23505") return R.conflict(res, "Email already exists");
            return R.internalError(res, error.message);
        }
    },

    /**
     * Handle PUT /users/:id
     * Update an existing user.
     * Body can include any updatable fields: { full_name?, phone?, role?, status? }
     */
    async update(req, res) {
        try {
            const id = (req.params.id || "").trim();

            // Validate UUID format trước khi query
            if (!isUuid(id)) {
                return R.badRequest(res, "Invalid UUID format");
            }

            const user = await userService.updateUser(id, req.body);
            if (!user) return R.notFound(res, "User not found");
            return R.ok(res, user, "User updated successfully");
        } catch (error) {
            console.error("updateUser error:", error);
            return R.internalError(res, error.message);
        }
    },

    /**
     * Handle DELETE /users/:id
     * Soft delete a user (marks deleted_at).
     */
    async remove(req, res) {
        try {
            const { id } = req.params;
            const deleted = await userService.deleteUser(id);
            if (!deleted) return R.notFound(res, "User not found or already deleted");
            return R.ok(res, { deleted: true }, "User soft deleted successfully");
        } catch (error) {
            console.error("deleteUser error:", error);
            return R.internalError(res, error.message);
        }
    },
};

export default userController;
