import crypto from "node:crypto";
import { sendJson, setNoStore } from "./http.js";

const COOKIE_NAME = "art_pool_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET은 32자 이상이어야 합니다.");
  }
  return secret;
}

function sign(value) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) return cookies;

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name) cookies[name] = value;
    return cookies;
  }, {});
}

function secureCookieAttribute() {
  return process.env.VERCEL || process.env.NODE_ENV === "production"
    ? "; Secure"
    : "";
}

export function verifyAdminPassword(candidate) {
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!password || password.length < 12) {
    throw new Error("ADMIN_PASSWORD는 12자 이상이어야 합니다.");
  }
  return safeEqual(candidate, password);
}

export function createAdminSessionCookie() {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  })).toString("base64url");
  const token = `${payload}.${sign(payload)}`;

  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secureCookieAttribute()}`;
}

export function createExpiredAdminSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookieAttribute()}`;
}

export function hasValidAdminSession(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return false;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(data.exp) && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function requireAdmin(req, res) {
  setNoStore(res);
  if (hasValidAdminSession(req)) return true;

  sendJson(res, 401, { error: "관리자 로그인이 필요합니다." });
  return false;
}
