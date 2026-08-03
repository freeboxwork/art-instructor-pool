import {
  createAdminSessionCookie,
  verifyAdminPassword,
} from "../../lib/admin-auth.js";
import {
  allowMethods,
  isSameOrigin,
  readJsonBody,
  sendJson,
  setNoStore,
} from "../../lib/http.js";

export default async function handler(req, res) {
  setNoStore(res);
  if (!allowMethods(req, res, ["POST"])) return;
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: "허용되지 않은 요청 출처입니다." });
    return;
  }

  const body = readJsonBody(req);
  const password = typeof body?.password === "string" ? body.password : "";

  try {
    if (!verifyAdminPassword(password)) {
      sendJson(res, 401, { error: "관리자 비밀번호가 올바르지 않습니다." });
      return;
    }

    res.setHeader("Set-Cookie", createAdminSessionCookie());
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("admin_login_configuration_failed", error);
    sendJson(res, 500, { error: "관리자 로그인을 설정하지 못했습니다." });
  }
}
