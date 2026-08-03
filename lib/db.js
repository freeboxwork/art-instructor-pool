import { neon } from "@neondatabase/serverless";

let databaseClient;

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
