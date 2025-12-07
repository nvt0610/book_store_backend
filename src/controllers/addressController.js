import addressService from "../services/addressService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const addressController = {
  async list(req, res) {
    try {
      const result = await addressService.list(req.query);
      return R.ok(res, result, "Fetched addresses successfully");
    } catch (err) {
      console.error("[addressController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      try {
        validate.uuid(req.params.id, "id");
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const row = await addressService.getById(req.params.id, req.query.showDeleted);
      return row
        ? R.ok(res, row, "Fetched address successfully")
        : R.notFound(res, "Address not found");
    } catch (err) {
      console.error("[addressController.getById]", err);
      return R.internalError(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const body = req.body;

      // Validate required fields
      try {
        validate.required(body.full_name, "full_name");
        validate.required(body.phone, "phone");
        validate.required(body.address_line, "address_line");

        // Clean & standardize
        body.full_name = validate.trimString(body.full_name, "full_name");
        body.phone = validate.trimString(body.phone, "phone");
        body.address_line = validate.trimString(body.address_line, "address_line");

        // Optional fields
        if (body.address_line2)
          body.address_line2 = validate.optionalTrim(body.address_line2);

        if (body.postal_code) {
          body.postal_code = validate.optionalTrim(body.postal_code);
          validate.maxLength(body.postal_code, 20, "postal_code");
          validate.postalCode(body.postal_code, "postal_code");
        }

        validate.maxLength(body.full_name, 150, "full_name");
        validate.maxLength(body.phone, 20, "phone");
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      // Always enforce authenticated user
      const data = { ...body, user_id: req.user.id };

      const created = await addressService.create(data);
      return R.created(res, created, "Address created successfully");

    } catch (err) {
      console.error("[addressController.create]", err);
      return R.internalError(res, err.message);
    }
  },

  async update(req, res) {
    try {
      try {
        validate.uuid(req.params.id, "id");
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const body = req.body;

      // Optional updates → clean input
      if (body.full_name) {
        body.full_name = validate.trimString(body.full_name, "full_name");
        validate.maxLength(body.full_name, 150, "full_name");
      }

      if (body.phone) {
        body.phone = validate.trimString(body.phone, "phone");
        validate.maxLength(body.phone, 20, "phone");
      }

      if (body.address_line)
        body.address_line = validate.trimString(body.address_line, "address_line");

      if (body.address_line2)
        body.address_line2 = validate.optionalTrim(body.address_line2);

      if (body.postal_code) {
        body.postal_code = validate.optionalTrim(body.postal_code);
        validate.maxLength(body.postal_code, 20, "postal_code");
        validate.postalCode(body.postal_code, "postal_code");
      }

      const updated = await addressService.update(req.params.id, body);
      return updated
        ? R.ok(res, updated, "Address updated successfully")
        : R.notFound(res, "Address not found");

    } catch (err) {
      console.error("[addressController.update]", err);
      return R.internalError(res, err.message);
    }
  },

  async setDefault(req, res) {
    try {
      validate.uuid(req.params.id, "id");

      const result = await addressService.setDefault(req.params.id);

      return R.ok(res, result, "Default address updated successfully");

    } catch (err) {
      console.error("[addressController.setDefault]", err);
      return R.internalError(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      try {
        validate.uuid(req.params.id, "id");
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const deleted = await addressService.remove(req.params.id);

      return deleted
        ? R.ok(res, { deleted: true }, "Address soft deleted successfully")
        : R.notFound(res, "Address not found or already deleted");

    } catch (err) {
      console.error("[addressController.remove]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default addressController;
