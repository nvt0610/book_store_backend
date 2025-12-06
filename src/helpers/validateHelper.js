/**
 * @module helpers/validateHelper
 * Common reusable validation helpers for controllers.
 */

import { validate as isUuid } from "uuid";

const validateHelper = {
  /* ---------------------------------------------------------------------- */
  /*  BASIC STRING VALIDATION                                               */
  /* ---------------------------------------------------------------------- */

  required(value, fieldName) {
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new Error(`Missing required field: ${fieldName}`);
    }
  },

  optionalTrim(value) {
    if (typeof value === "string") return value.trim();
    return value;
  },

  /** normalize strings like "   abc   " → "abc" */
  trimString(value, fieldName) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed === "") {
      throw new Error(`${fieldName} cannot be empty`);
    }
    return trimmed;
  },

  /** simple email validation (suitable for student projects) */
  email(value, fieldName = "email") {
    if (!value) throw new Error(`Missing required field: ${fieldName}`);

    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(String(value).trim())) {
      throw new Error(`Invalid email format`);
    }
  },

  maxLength(value, max, fieldName) {
    if (value && String(value).length > max) {
      throw new Error(`${fieldName} must be <= ${max} characters`);
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  UUID VALIDATION                                                       */
  /* ---------------------------------------------------------------------- */

  uuid(value, fieldName) {
    if (!isUuid(value)) {
      throw new Error(`Invalid UUID format for ${fieldName}`);
    }
  },

  uuidFields(body, fields) {
    for (const key of fields) {
      const val = body[key];
      if (val === undefined || val === null) {
        throw new Error(`Missing required field: ${key}`);
      }
      if (!isUuid(val)) {
        throw new Error(`Invalid UUID format for ${key}`);
      }
    }
  },

  uuidFieldsOptional(body, fields) {
    for (const key of fields) {
      const val = body[key];
      if (val != null && !isUuid(val)) {
        throw new Error(`Invalid UUID format for ${key}`);
      }
    }
  },

  uuidArray(value, fieldName = "ids") {
    if (!Array.isArray(value)) {
      throw new Error(`${fieldName} must be an array`);
    }
    for (const v of value) {
      if (!isUuid(v)) {
        throw new Error(`Invalid UUID in ${fieldName}`);
      }
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  NUMBER VALIDATION                                                     */
  /* ---------------------------------------------------------------------- */

  numeric(value, fieldName) {
    if (!isFinite(Number(value))) {
      throw new Error(`${fieldName} must be a valid number`);
    }
  },

  integer(value, fieldName) {
    if (!Number.isInteger(Number(value))) {
      throw new Error(`${fieldName} must be an integer`);
    }
  },

  positive(value, fieldName) {
    if (Number(value) <= 0) {
      throw new Error(`${fieldName} must be > 0`);
    }
  },

  nonNegative(value, fieldName) {
    if (Number(value) < 0) {
      throw new Error(`${fieldName} must be >= 0`);
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  ARRAY VALIDATION                                                      */
  /* ---------------------------------------------------------------------- */

  array(value, fieldName) {
    if (!Array.isArray(value)) {
      throw new Error(`${fieldName} must be an array`);
    }
  },

  arrayNotEmpty(value, fieldName) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`${fieldName} must be a non-empty array`);
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  ENUM VALIDATION                                                       */
  /* ---------------------------------------------------------------------- */

  enum(value, allowed, fieldName) {
    if (!allowed.includes(value)) {
      throw new Error(
        `${fieldName} must be one of: ${allowed.join(", ")}`
      );
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  URL VALIDATION (OPTIONAL)                                             */
  /* ---------------------------------------------------------------------- */

  url(value, fieldName) {
    if (!value) return;
    try {
      new URL(value);
    } catch {
      throw new Error(`${fieldName} must be a valid URL`);
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  BULK REQUIRED FIELDS                                                  */
  /* ---------------------------------------------------------------------- */

  requiredFields(body, fields) {
    for (const key of fields) {
      if (
        body[key] === undefined ||
        body[key] === null ||
        String(body[key]).trim() === ""
      ) {
        throw new Error(`Missing required field: ${key}`);
      }
    }
  },
};

export default validateHelper;
