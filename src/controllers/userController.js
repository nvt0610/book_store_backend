import userService from "../services/userService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const USER_ROLES = ["GUEST", "CUSTOMER", "ADMIN"];
const USER_STATUS = ["ACTIVE", "INACTIVE"];

const userController = {
  /** GET /users */
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
      console.error("[userController.list]", error);
      return R.internalError(res, error.message);
    }
  },

  /** GET /users/:id */
  async getById(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const user = await userService.getUserById(
        req.params.id,
        req.query.showDeleted || "active"
      );

      return user
        ? R.ok(res, user, "Fetched user successfully")
        : R.notFound(res, "User not found");
    } catch (error) {
      console.error("[userController.getById]", error);
      return R.badRequest(res, error.message);
    }
  },

  /** POST /users */
  async create(req, res) {
    try {
      const body = req.body;

      // Required
      validate.required(body.email, "email");
      validate.email(body.email);
      validate.maxLength(body.email, 150, "email");

      validate.required(body.password, "password");

      // Name requirement:
      if (!body.full_name && !body.first_name && !body.last_name) {
        return R.badRequest(
          res,
          "Missing required field: full_name OR (first_name + last_name)"
        );
      }

      // Normalize & check lengths
      if (body.full_name) {
        body.full_name = validate.trimString(body.full_name, "full_name");
        validate.maxLength(body.full_name, 150, "full_name");
      }
      if (body.first_name) validate.maxLength(body.first_name, 100, "first_name");
      if (body.last_name) validate.maxLength(body.last_name, 100, "last_name");

      if (body.phone) validate.maxLength(body.phone, 20, "phone");

      if (body.role) validate.enum(body.role, USER_ROLES, "role");
      if (body.status) validate.enum(body.status, USER_STATUS, "status");

      const user = await userService.createUser(body);
      return R.created(res, user, "User created successfully");
    } catch (error) {
      console.error("[userController.create]", error);

      if (error.code === "23505") {
        return R.conflict(res, "Email already exists");
      }

      return R.badRequest(res, error.message);
    }
  },

  /** PUT /users/:id */
  async update(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const body = req.body;

      // Optional validations
      if (body.email != null) {
        validate.email(body.email);
        validate.maxLength(body.email, 150, "email");
      }

      if (body.full_name) {
        body.full_name = validate.trimString(body.full_name, "full_name");
        validate.maxLength(body.full_name, 150, "full_name");
      }

      if (body.first_name) validate.maxLength(body.first_name, 100, "first_name");
      if (body.last_name) validate.maxLength(body.last_name, 100, "last_name");

      if (body.phone) validate.maxLength(body.phone, 20, "phone");

      if (body.role) validate.enum(body.role, USER_ROLES, "role");
      if (body.status) validate.enum(body.status, USER_STATUS, "status");

      const user = await userService.updateUser(req.params.id, body);

      return user
        ? R.ok(res, user, "User updated successfully")
        : R.notFound(res, "User not found");
    } catch (error) {
      console.error("[userController.update]", error);
      return R.badRequest(res, error.message);
    }
  },

  async setStatus(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const { status } = req.body;

      validate.required(status, "status");
      validate.enum(status, USER_STATUS, "status");

      const user = await userService.setStatus(req.params.id, status);

      return user
        ? R.ok(res, user, "Status updated successfully")
        : R.notFound(res, "User not found");
    } catch (error) {
      console.error("[userController.setStatus]", error);
      return R.badRequest(res, error.message);
    }
  },

  /** DELETE /users/:id */
  async remove(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const deleted = await userService.deleteUser(req.params.id);

      return deleted
        ? R.ok(res, { deleted: true }, "User soft deleted successfully")
        : R.notFound(res, "User not found or already deleted");
    } catch (error) {
      console.error("[userController.remove]", error);
      return R.internalError(res, error.message);
    }
  },
};

export default userController;
