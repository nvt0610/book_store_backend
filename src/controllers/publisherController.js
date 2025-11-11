import publisherService from "../services/publisherService.js";
import responseHelper from "../helpers/responseHelper.js";
import { validate as isUuid } from "uuid";

const R = responseHelper;

const publisherController = {
  async list(req, res) {
    try {
      const result = await publisherService.listPublishers(req.query);
      return R.ok(res, result, "Fetched publishers successfully");
    } catch (err) {
      console.error("listPublishers error:", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const publisher = await publisherService.getPublisherById(id, req.query.showDeleted);
      if (!publisher) return R.notFound(res, "Publisher not found");
      return R.ok(res, publisher, "Fetched publisher successfully");
    } catch (err) {
      console.error("getPublisherById error:", err);
      return R.internalError(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const { name } = req.body;
      if (!name) return R.badRequest(res, "Missing required field: name");
      const publisher = await publisherService.createPublisher(req.body);
      return R.created(res, publisher, "Publisher created successfully");
    } catch (err) {
      console.error("createPublisher error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.internalError(res, err.message);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const publisher = await publisherService.updatePublisher(id, req.body);
      if (!publisher) return R.notFound(res, "Publisher not found");
      return R.ok(res, publisher, "Publisher updated successfully");
    } catch (err) {
      console.error("updatePublisher error:", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.internalError(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      if (!isUuid(id)) return R.badRequest(res, "Invalid UUID format");
      const deleted = await publisherService.deletePublisher(id);
      if (!deleted) return R.notFound(res, "Publisher not found or already deleted");
      return R.ok(res, { deleted: true }, "Publisher soft deleted successfully");
    } catch (err) {
      console.error("deletePublisher error:", err);
      return R.internalError(res, err.message);
    }
  },
};

export default publisherController;
