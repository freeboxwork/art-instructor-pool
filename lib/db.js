import { neon } from "@neondatabase/serverless";

let databaseClient;
let mcpDatabaseClient;

export function getDb() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  }

  if (!databaseClient) {
    databaseClient = neon(connectionString);
  }

  return databaseClient;
}

export function getMcpDb() {
  const connectionString = (
    process.env.MCP_DATABASE_URL || process.env.DATABASE_URL
  )?.trim();
  if (!connectionString) {
    throw new Error("MCP_DATABASE_URL 또는 DATABASE_URL 환경변수가 설정되지 않았습니다.");
  }

  if (!mcpDatabaseClient) {
    mcpDatabaseClient = neon(connectionString);
  }

  return mcpDatabaseClient;
}
