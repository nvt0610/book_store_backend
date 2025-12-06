import publisherService from "../services/publisherService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const publisherController = {
  async list(req, res) {
    try {
      const result = await publisherService.listPublishers(req.query);
      return R.ok(res, result, "Fetched publishers successfully");
    } catch (err) {
      console.error("[publisherController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const publisher = await publisherService.getPublisherById(
        req.params.id,
        req.query.showDeleted
      );

      return publisher
        ? R.ok(res, publisher, "Fetched publisher successfully")
        : R.notFound(res, "Publisher not found");
    } catch (err) {
      console.error("[publisherController.getById]", err);
      return R.badRequest(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const body = req.body;

      // Required
      validate.required(body.name, "name");

      // Normalize & constraints
      body.name = validate.trimString(body.name, "name");
      validate.maxLength(body.name, 150, "name");

      if (body.phone) validate.maxLength(body.phone, 50, "phone");

      // Optional URL validations
      if (body.website) validate.url(body.website, "website");
      if (body.logo_url) validate.url(body.logo_url, "logo_url");

      const publisher = await publisherService.createPublisher(body);
      return R.created(res, publisher, "Publisher created successfully");
    } catch (err) {
      console.error("[publisherController.create]", err);

      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  async update(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const body = req.body;

      // Optional validations if provided
      if (body.name != null) {
        body.name = validate.trimString(body.name, "name");
        validate.maxLength(body.name, 150, "name");
      }

      if (body.phone != null) validate.maxLength(body.phone, 50, "phone");

      if (body.website) validate.url(body.website, "website");
      if (body.logo_url) validate.url(body.logo_url, "logo_url");

      const publisher = await publisherService.updatePublisher(req.params.id, body);

      return publisher
        ? R.ok(res, publisher, "Publisher updated successfully")
        : R.notFound(res, "Publisher not found");
    } catch (err) {
      console.error("[publisherController.update]", err);

      if (err.status === 409) return R.conflict(res, err.message);
      return R.badRequest(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const deleted = await publisherService.deletePublisher(req.params.id);

      return deleted
        ? R.ok(res, { deleted: true }, "Publisher soft deleted successfully")
        : R.notFound(res, "Publisher not found or already deleted");
    } catch (err) {
      console.error("[publisherController.remove]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default publisherController;
