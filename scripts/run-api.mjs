import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(root, "apps", "api");
const python = join(apiDir, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

if (!existsSync(python)) {
  console.error("API virtual environment missing. Follow the setup steps in README.md.");
  process.exit(1);
}

const env = {
  ...process.env,
  PYTHONPATH: [root, join(root, "shared"), apiDir, process.env.PYTHONPATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":"),
};

const child = spawn(python, ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"], {
  cwd: apiDir,
  stdio: "inherit",
  env,
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
