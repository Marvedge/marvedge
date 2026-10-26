#!/usr/bin/env tsx
import {
  validatePreflightEnv,
  formatPreflightReport,
  type PreflightTarget,
} from "../app/lib/preflight/envValidator";
import * as dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";

// Load environment from common paths
const envCandidates = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
];
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

const args = process.argv.slice(2);
let target: PreflightTarget = "all";
let isProd = process.env.NODE_ENV === "production";

for (const arg of args) {
  if (arg.startsWith("--scope=")) {
    const val = arg.split("=")[1].toLowerCase() as PreflightTarget;
    if (["app", "worker", "ml-gateway", "all"].includes(val)) {
      target = val;
    }
  } else if (arg === "--prod" || arg === "--production") {
    isProd = true;
  }
}

const result = validatePreflightEnv(target, process.env, { isProduction: isProd });
console.log(formatPreflightReport(result));

if (!result.valid) {
  process.exit(1);
}
