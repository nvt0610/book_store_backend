import bcrypt from "bcrypt";

/**
 * @module helpers/passwordHelper
 * Utility for securely hashing and verifying passwords using bcrypt.
 * Designed to be used before storing credentials in the database.
 */

const SALT_ROUNDS = 10;

const passwordHelper = {
  /**
   * Hash a plain text password before storing it in the database.
   * Automatically generates a random salt for each password.
   *
   * @param {string} plainPassword - The raw user password
   * @returns {Promise<string>} The bcrypt-hashed password
   * @throws {Error} If no password is provided
   */
  async hashPassword(plainPassword) {
    if (typeof plainPassword !== "string" || plainPassword.trim().length === 0) {
      throw new Error("Password is required to hash");
    }

    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(plainPassword.trim(), salt);
    return hash;
  },

  /**
   * Compare a plain text password with its hashed version.
   * Returns true if the passwords match, false otherwise.
   *
   * @param {string} plainPassword - Raw user input password
   * @param {string} hashedPassword - Stored hashed password from DB
   * @returns {Promise<boolean>} True if match, false otherwise
   */
  async comparePassword(plainPassword, hashedPassword) {
    if (
      typeof plainPassword !== "string" ||
      typeof hashedPassword !== "string" ||
      !plainPassword ||
      !hashedPassword
    ) {
      return false;
    }
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  /**
   * Check if a password hash was generated with outdated salt rounds.
   * Can be used to trigger rehashing when increasing SALT_ROUNDS.
   *
   * @param {string} hashedPassword - The existing hashed password
   * @returns {boolean} True if rehash is recommended, false otherwise
   */
  needsRehash(hashedPassword) {
    if (typeof hashedPassword !== "string") return false;

    // bcrypt format: $2b$10$<22-char-salt><31-char-hash>
    const parts = hashedPassword.split("$");
    const currentRounds = parseInt(parts[2], 10);
    return Number.isInteger(currentRounds) && currentRounds < SALT_ROUNDS;
  },
};

export default passwordHelper;
