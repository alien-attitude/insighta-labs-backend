import jwt from "jsonwebtoken";
import crypto from "crypto";
import RefreshToken from "../models/refreshToken.model.js";
import { JWT_SECRET } from "../config/env.js";

const ACCESS_TOKEN_TTL_SEC  = 3 * 60;       // 3 minutes
const REFRESH_TOKEN_TTL_SEC = 5 * 60;       // 5 minutes

/**
 * Issue a signed JWT access token
 */
export function issueAccessToken(user) {
  return jwt.sign(
    { userId: user.id, role: user.role, username: user.username },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL_SEC }
  );
}

/**
 * Issue a random refresh token and persist it in the DB
 */
export async function issueRefreshToken(userId) {
  const token      = crypto.randomBytes(48).toString("hex");
  const expires_at = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);

  await RefreshToken.create({ token, user_id: userId, expires_at });
  return token;
}

/**
 * Issue both tokens atomically
 */
export async function issueTokenPair(user) {
  const access_token  = issueAccessToken(user);
  const refresh_token = await issueRefreshToken(user.id);
  return { access_token, refresh_token };
}

/**
 * Verify a JWT access token — returns payload or throws
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Consume a refresh token (rotate) — returns { access_token, refresh_token, user_id }
 * Throws if token is invalid, used, or expired
 */
export async function rotateRefreshToken(token, UserModel) {
  const record = await RefreshToken.findOne({ token });

  if (!record)               throw Object.assign(new Error("Invalid refresh token"), { statusCode: 401 });
  if (record.used)           throw Object.assign(new Error("Refresh token already used"), { statusCode: 401 });
  if (record.expires_at < new Date()) throw Object.assign(new Error("Refresh token expired"), { statusCode: 401 });

  // Invalidate the used token immediately
  await RefreshToken.deleteOne({ token });

  const user = await UserModel.findOne({ id: record.user_id });
  if (!user)                 throw Object.assign(new Error("User not found"), { statusCode: 401 });
  if (!user.is_active)       throw Object.assign(new Error("Account is inactive"), { statusCode: 403 });

  return issueTokenPair(user);
}

/**
 * Invalidate a refresh token (logout)
 */
export async function invalidateRefreshToken(token) {
  await RefreshToken.deleteOne({ token });
}
