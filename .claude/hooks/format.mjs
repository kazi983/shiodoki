// PostToolUse hook: format the file Claude just edited with the repo's Prettier,
// so files stay formatted between commits (lint-staged only runs on commit).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const prettier = join(root, "node_modules", ".bin", "prettier");
const file = JSON.parse(readFileSync(0, "utf8")).tool_input?.file_path;

if (file && existsSync(file) && existsSync(prettier)) {
  try {
    // --ignore-unknown: skip file types Prettier does not handle; .prettierignore still applies.
    execFileSync(prettier, ["--write", "--ignore-unknown", "--log-level", "warn", file], {
      cwd: root,
      stdio: "inherit",
    });
  } catch {
    // A syntax error the edit left behind: let Claude see it on the next typecheck, not block here.
  }
}
