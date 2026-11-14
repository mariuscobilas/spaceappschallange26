import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const root = resolve(__dirname, "../../../..");
const payloadsDir = join(root, "shared", "payloads");

console.log("Checking shared JSON payloads in:", payloadsDir);

try {
  const files = readdirSync(payloadsDir).filter((f) => f.endsWith(".json"));
  let passed = 0;

  for (const file of files) {
    const fullPath = join(payloadsDir, file);
    const content = readFileSync(fullPath, "utf-8");
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Payload root must be an object or array");
      }
      console.log(`  ✓ ${file} (Valid JSON, ${Object.keys(parsed).length} keys)`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${file} Failed:`, err.message);
      process.exitCode = 1;
    }
  }

  console.log(`\nVerified ${passed}/${files.length} payload fixtures successfully.`);
} catch (err) {
  console.error("Failed to read payloads directory:", err.message);
  process.exitCode = 1;
}

