import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const tscBin = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
const viteBin = join(projectRoot, "node_modules", "vite", "bin", "vite.js");

function runNode(script, args, cwd = projectRoot) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

let status = runNode(tscBin, ["-b"]);
if (status !== 0) process.exit(status);

const hasNonAsciiPath = Array.from(projectRoot).some((character) => (character.codePointAt(0) ?? 0) > 127);
if (process.platform !== "win32" || !hasNonAsciiPath) {
  process.exit(runNode(viteBin, ["build"]));
}

const drive = ["R", "Q", "P", "O"].find((letter) => !existsSync(`${letter}:\\`));
if (!drive) throw new Error("빌드에 사용할 빈 임시 드라이브 문자를 찾지 못했습니다.");

const mappedRoot = `${drive}:\\`;
const map = spawnSync("subst", [`${drive}:`, projectRoot], { stdio: "inherit" });
if (map.status !== 0) process.exit(map.status ?? 1);

try {
  const mappedViteBin = join(mappedRoot, "node_modules", "vite", "bin", "vite.js");
  status = runNode(mappedViteBin, ["build"], mappedRoot);
} finally {
  spawnSync("subst", [`${drive}:`, "/d"], { stdio: "ignore" });
}

process.exit(status);
