/**
 * @module helpers/validateHelper
 * Common reusable validation helpers for controllers.
 */

import { validate as isUuid } from "uuid";

const PAYMENT_METHODS = ["COD", "MOMO", "VNPAY", "CREDIT_CARD"];

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

  /** normalize strings like "   abc   " â†’ "abc" */
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

  minLength(value, min, fieldName) {
    if (value && String(value).length < min) {
      throw new Error(`${fieldName} must be at least ${min} characters`);
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
      throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}`);
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  URL VALIDATION (OPTIONAL)                                             */
  /* ---------------------------------------------------------------------- */

  url(value, fieldName) {
    if (!value) return;

    // Accept backend-generated relative URLs (e.g., "/img/xxx.webp")
    // because new URL() requires an absolute URL.
    if (typeof value === "string" && value.startsWith("/")) {
      return;
    }

    try {
      // Validate absolute URLs normally
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

  /* ---------------------------------------------------------------------- */
  /*  SPECIFIC FIELDS                                                  */
  /* ---------------------------------------------------------------------- */

  postalCode(value, fieldName = "postal_code") {
    if (!value) return;
    if (!/^[0-9]+$/.test(String(value))) {
      throw new Error(`${fieldName} must contain digits only`);
    }
  },

  phoneNumber(value, fieldName = "phone") {
    if (!value) return;
    const trimmed = String(value).trim();

    // Chỉ cho phép 0-9, tối thiểu 8 – tối đa 20 số
    if (!/^[0-9]{8,20}$/.test(trimmed)) {
      throw new Error(`${fieldName} must contain digits only (8-20 digits)`);
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  PAYMENT METHOD VALIDATION                                             */
  /* ---------------------------------------------------------------------- */

  paymentMethod(value, fieldName = "payment_method") {
    if (value == null) return "COD"; // default

    if (typeof value !== "string") {
      throw new Error(`${fieldName} must be a string`);
    }

    const normalized = value.trim().toUpperCase();

    if (!PAYMENT_METHODS.includes(normalized)) {
      throw new Error(
        `${fieldName} must be one of: ${PAYMENT_METHODS.join(", ")}`
      );
    }

    return normalized;
  },
};

export default validateHelper;
