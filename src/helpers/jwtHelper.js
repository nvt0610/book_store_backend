/**
 * @module helpers/jwtHelper
 * Utility functions for creating and verifying JWT tokens.
 */

import jwt from "jsonwebtoken";

const jwtHelper = {
  /**
   * Sign a new JWT token.
   * @param {Object} payload - Token payload (user data)
   * @param {Object} [options] - Token options (expiresIn, subject, etc.)
   * @returns {string} Signed JWT token
   */
  signToken(payload, options = {}) {
    const secret = process.env.JWT_SECRET;
    const expiresIn = options.expiresIn || process.env.JWT_EXPIRES_IN || "1d";
    return jwt.sign(payload, secret, { expiresIn });
  },

  /**
   * Verify and decode a JWT token.
   * @param {string} token - JWT token
   * @returns {Object|null} Decoded payload or null if invalid
   */
  verifyToken(token) {
    try {
      const secret = process.env.JWT_SECRET;
      return jwt.verify(token, secret);
    } catch (err) {
      return null;
    }
  },
};

export default jwtHelper;
