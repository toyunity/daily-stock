import { readFileSync } from "node:fs";
import { LlmReportOutputSchema } from "@daily-stock/shared";

/**
 * Standalone schema validator for the dispatch stage. Reads a report JSON file
 * (default reports/report.json) and validates it against LlmReportOutputSchema
 * — the same schema finalize.ts enforces — so problems are caught *before*
 * publishing rather than as a red CI run.
 *
 * Exit 0 + "SCHEMA_OK" on success; exit 1 + "SCHEMA_INVALID" + issues on failure.
 */
const path = process.argv[2] ?? "reports/report.json";

let raw: string;
try {
  raw = readFileSync(path, "utf8");
} catch (err) {
  console.error("READ_ERROR", (err as Error).message);
  process.exit(1);
}

let json: unknown;
try {
  json = JSON.parse(raw);
} catch (err) {
  console.error("INVALID_JSON", (err as Error).message);
  process.exit(1);
}

const result = LlmReportOutputSchema.safeParse(json);
if (!result.success) {
  console.error("SCHEMA_INVALID");
  console.error(JSON.stringify(result.error.issues.slice(0, 25), null, 2));
  process.exit(1);
}

console.log("SCHEMA_OK");
