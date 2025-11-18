import db from "../db/db.js";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import passwordHelper from "../helpers/passwordHelper.js";
import nameHelper from "../helpers/nameHelper.js";

const { normalizeName } = nameHelper;
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

const authService = {
  /** Register a new user */
  async register(data) {
    const { full_name, first_name, last_name } = normalizeName(data);
    const hashedPassword = await passwordHelper.hashPassword(data.password);

    const checkSql = `SELECT 1 FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`;
    const { rowCount } = await db.query(checkSql, [data.email]);
    if (rowCount > 0) {
      const e = new Error("Email already exists");
      e.status = 409;
      throw e;
    }

    const id = uuidv4();
    const sql = `
      INSERT INTO users (id, full_name, first_name, last_name, email, password, phone, role)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'CUSTOMER')
      RETURNING id, full_name, email, phone, role, status, created_at
    `;
    const params = [id, full_name, first_name, last_name, data.email, hashedPassword, data.phone];
    const { rows } = await db.query(sql, params);
    return rows[0];
  },

  /** Login → verify password and issue JWT */
  async login(email, password) {
    const sql = `
      SELECT id, email, password, role, full_name, status
      FROM users
      WHERE lower(email) = lower($1) AND deleted_at IS NULL
    `;
    const { rows } = await db.query(sql, [email]);
    const user = rows[0];
    if (!user) throw Object.assign(new Error("User not found"), { status: 404 });
    if (user.status !== "ACTIVE") throw Object.assign(new Error("User inactive"), { status: 403 });

    const ok = await passwordHelper.comparePassword(password, user.password);
    if (!ok) throw Object.assign(new Error("Invalid credentials"), { status: 401 });

    return await this._issueTokens(user);
  },

  /** Refresh access token from a valid refresh token */
  async refreshToken(oldRefreshToken) {
    try {
      const decoded = jwt.verify(oldRefreshToken, process.env.JWT_SECRET);
      const user_id = decoded.sub;

      // find active sessions
      const { rows } = await db.query(
        `SELECT id, hashed_token FROM user_sessions WHERE user_id = $1 AND is_revoked = false`,
        [user_id]
      );

      let session = null;
      for (const row of rows) {
        const match = await passwordHelper.comparePassword(oldRefreshToken, row.hashed_token);
        if (match) {
          session = row;
          break;
        }
      }

      if (!session) throw Object.assign(new Error("Invalid or revoked refresh token"), { status: 401 });

      // verify user still active
      const { rows: users } = await db.query(`SELECT id, role, email, full_name, status FROM users WHERE id = $1`, [user_id]);
      const user = users[0];
      if (!user || user.status !== "ACTIVE") throw Object.assign(new Error("User inactive or deleted"), { status: 403 });

      // issue new tokens
      const tokens = await this._issueTokens(user);

      // revoke old token
      await db.query(`UPDATE user_sessions SET is_revoked = true WHERE id = $1`, [session.id]);

      return tokens;
    } catch (err) {
      const e = new Error("Invalid refresh token");
      e.status = 401;
      throw e;
    }
  },

  /** Centralized token issuing logic */
  async _issueTokens(user) {
    const payload = { sub: user.id, role: user.role };
    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL });

    const hashedToken = await passwordHelper.hashPassword(refreshToken);
    await db.query(
      `INSERT INTO user_sessions (id, user_id, hashed_token, session_jti, ip_address, user_agent, expired_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '${REFRESH_TOKEN_TTL}')`,
      [uuidv4(), user.id, hashedToken, uuidv4(), "unknown", "unknown"]
    );

    await db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
    };
  },

  /** Get current user info */
  async getMe(user_id) {
    const sql = `
      SELECT id, full_name, email, phone, role, status, created_at, updated_at
      FROM users
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const { rows } = await db.query(sql, [user_id]);
    return rows[0] || null;
  },

  /** Update own profile */
  async updateProfile(user_id, data) {
    const { full_name, first_name, last_name } = normalizeName(data);
    const sets = [];
    const params = [user_id];

    if (full_name) {
      sets.push(`full_name = $${params.length + 1}`);
      params.push(full_name);
    }
    if (first_name) {
      sets.push(`first_name = $${params.length + 1}`);
      params.push(first_name);
    }
    if (last_name) {
      sets.push(`last_name = $${params.length + 1}`);
      params.push(last_name);
    }
    if (data.phone) {
      sets.push(`phone = $${params.length + 1}`);
      params.push(data.phone);
    }

    if (sets.length === 0) return this.getMe(user_id);

    const sql = `
      UPDATE users
      SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, full_name, email, phone, role, updated_at
    `;
    const { rows } = await db.query(sql, params);
    return rows[0] || null;
  },

  /** Logout (revoke refresh token) */
  async logout(user_id, refreshToken) {
    const { rows } = await db.query(
      `SELECT id, hashed_token FROM user_sessions WHERE user_id = $1 AND is_revoked = false`,
      [user_id]
    );

    for (const s of rows) {
      const match = await passwordHelper.comparePassword(refreshToken, s.hashed_token);
      if (match) {
        await db.query(`UPDATE user_sessions SET is_revoked = true WHERE id = $1`, [s.id]);
        return true;
      }
    }
    return false;
  },
};

export default authService;
