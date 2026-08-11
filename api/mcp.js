import { createMcpHandler } from "@modelcontextprotocol/server";

import { getMcpDb } from "../lib/db.js";
import { verifyMcpAccessToken } from "../lib/mcp-auth.js";
import { createArtInstructorMcpServer } from "../lib/mcp-server.js";

const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "MCP-Protocol-Version",
  "MCP-Session-Id",
  "MCP-Method",
  "MCP-Name",
  "Last-Event-ID",
].join(", ");

const EXPOSED_HEADERS = [
  "MCP-Protocol-Version",
  "MCP-Session-Id",
].join(", ");

const protocolHandler = createMcpHandler(
  ({ authInfo }) => createArtInstructorMcpServer({
    sql: getMcpDb(),
    accessTokenId: authInfo?.clientId,
    scopes: authInfo?.scopes || [],
  }),
  {
    responseMode: "json",
    onerror(error) {
      console.error("mcp_protocol_error", error);
    },
  },
);

function setCommonHeaders(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
}

function sendJson(res, statusCode, body) {
  setCommonHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function appendRequestHeaders(headers, source) {
  for (const [name, rawValue] of Object.entries(source || {})) {
    if (rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      rawValue.forEach((value) => headers.append(name, String(value)));
    } else {
      headers.set(name, String(rawValue));
    }
  }
  headers.delete("content-length");
}

async function readRequestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return req.body;
    return JSON.stringify(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function toWebRequest(req) {
  const forwardedHost = req.headers?.["x-forwarded-host"];
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers?.host || "localhost";
  const forwardedProto = req.headers?.["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || (process.env.VERCEL ? "https" : "http");
  const url = new URL(req.url || "/api/mcp", `${protocol}://${host}`);
  const headers = new Headers();
  appendRequestHeaders(headers, req.headers);

  return new Request(url, {
    method: req.method,
    headers,
    body: await readRequestBody(req),
  });
}

async function writeWebResponse(res, response) {
  setCommonHeaders(res);
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCommonHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    sendJson(res, 405, { error: "MCP 요청은 POST 방식만 지원합니다." });
    return;
  }

  try {
    const sql = getMcpDb();
    const access = await verifyMcpAccessToken(sql, req.headers?.authorization);
    if (!access) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="art-instructor-data"');
      sendJson(res, 401, { error: "유효한 MCP 액세스 토큰이 필요합니다." });
      return;
    }

    const request = await toWebRequest(req);
    const response = await protocolHandler.fetch(request, {
      parsedBody: req.body && typeof req.body === "object" ? req.body : undefined,
      authInfo: {
        token: access.tokenPrefix,
        clientId: access.id,
        scopes: access.scopes,
        expiresAt: access.expiresAt
          ? Math.floor(new Date(access.expiresAt).getTime() / 1000)
          : undefined,
      },
    });

    await writeWebResponse(res, response);
  } catch (error) {
    console.error("mcp_request_failed", error);
    sendJson(res, 500, { error: "MCP 요청을 처리하지 못했습니다." });
  }
}
