import authorService from "../services/authorService.js";
import responseHelper from "../helpers/responseHelper.js";
import validate from "../helpers/validateHelper.js";

const R = responseHelper;

const authorController = {
  async list(req, res) {
    try {
      const result = await authorService.listAuthors(req.query);
      return R.ok(res, result, "Fetched authors successfully");
    } catch (err) {
      console.error("[authorController.list]", err);
      return R.internalError(res, err.message);
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;

      try {
        validate.uuid(id, "id");
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const author = await authorService.getAuthorById(id, req.query.showDeleted);
      return author
        ? R.ok(res, author, "Fetched author successfully")
        : R.notFound(res, "Author not found");

    } catch (err) {
      console.error("[authorController.getById]", err);
      return R.internalError(res, err.message);
    }
  },

  async create(req, res) {
    try {
      const { name, photo_url } = req.body;

      try {
        validate.required(name, "name");
        validate.maxLength(name, 150, "name");

        if (photo_url) {
          validate.url(photo_url, "photo_url");
          validate.maxLength(photo_url, 500, "photo_url");
        }

        req.body.name = validate.trimString(name, "name");

        if (req.body.biography) {
          req.body.biography = validate.trimString(req.body.biography, "biography");
          validate.maxLength(req.body.biography, 5000, "biography");
        }

      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const author = await authorService.createAuthor(req.body);
      return R.created(res, author, "Author created successfully");

    } catch (err) {
      console.error("[authorController.create]", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.internalError(res, err.message);
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;

      try {
        validate.uuid(id, "id");

        if (req.body.name) {
          validate.maxLength(req.body.name, 150, "name");
          req.body.name = validate.trimString(req.body.name, "name");
        }

        if (req.body.photo_url) {
          validate.url(req.body.photo_url, "photo_url");
          validate.maxLength(req.body.photo_url, 500, "photo_url");
        }

        if (req.body.biography) {
          req.body.biography = validate.trimString(req.body.biography, "biography");
          validate.maxLength(req.body.biography, 5000, "biography");
        }

      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const author = await authorService.updateAuthor(id, req.body);
      return author
        ? R.ok(res, author, "Author updated successfully")
        : R.notFound(res, "Author not found");

    } catch (err) {
      console.error("[authorController.update]", err);
      if (err.status === 409) return R.conflict(res, err.message);
      return R.internalError(res, err.message);
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;

      try {
        validate.uuid(id, "id");
      } catch (e) {
        return R.badRequest(res, e.message);
      }

      const deleted = await authorService.deleteAuthor(id);

      return deleted
        ? R.ok(res, { deleted: true }, "Author soft deleted successfully")
        : R.notFound(res, "Author not found or already deleted");

    } catch (err) {
      console.error("[authorController.remove]", err);
      return R.internalError(res, err.message);
    }
  },
};

export default authorController;
