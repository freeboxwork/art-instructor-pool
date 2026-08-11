import fs from "node:fs";
import path from "node:path";

import { neon } from "@neondatabase/serverless";

import { projectRoot, requireDatabaseUrl } from "./load-local-env.mjs";

const migrationPath = path.join(
  projectRoot,
  "database",
  "migrations",
  "20260811_mcp_access.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const sql = neon(requireDatabaseUrl());

await sql.query(migration);
console.log("MCP access migration applied.");
