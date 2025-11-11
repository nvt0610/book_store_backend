import authorService from "../services/authorService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const authorController = {
  async list(req, res) {
    try {
      const result = await authorService.listAuthors(req.query);
      return R.ok(res, result, "Fetched authors successfully");
    } catch (err) {
      console.error("listAuthors error:", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const author = await authorService.getAuthorById(id, req.query.showDeleted);
      if (!author) return R.notFound(res, "Author not found");
      return R.ok(res, author, "Fetched author successfully");
    } catch (err) {
      console.error("getAuthorById error:", err);
      return R.internalError(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const { name } = req.body;
      if (!name) return R.badRequest(res, "Missing required field: name");
      const author = await authorService.createAuthor(req.body);
      return R.created(res, author, "Author created successfully");
    } catch (err) {
      console.error("createAuthor error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.internalError(res, err.message);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const author = await authorService.updateAuthor(id, req.body);
      if (!author) return R.notFound(res, "Author not found");
      return R.ok(res, author, "Author updated successfully");
    } catch (err) {
      console.error("updateAuthor error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.internalError(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const deleted = await authorService.deleteAuthor(id);
      if (!deleted) return R.notFound(res, "Author not found or already deleted");
      return R.ok(res, { deleted: true }, "Author soft deleted successfully");
    } catch (err) {
      console.error("deleteAuthor error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default authorController;
