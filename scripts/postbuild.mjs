// Cross-platform postbuild step (runs after `next build`).
//
// Prepares .next/standalone for packaging:
//   1. copies .next/static into the standalone output
//   2. copies public/ into the standalone output
//   3. copies native/wasm dependencies that must ship inside the standalone output
//
// Uses only Node built-ins so it behaves the same on macOS, Linux and Windows.

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = join(workspaceRoot, ".next", "standalone");

// ruvector-onnx-embeddings-wasm ships a platform-independent .wasm file.
//
// better-sqlite3 and ruvector-core are intentionally NOT copied: they contain
// platform-specific native binaries. The postinstall script in package.json
// installs them for the user's platform at npm install / npx time.
const NATIVE_DEPS = ["ruvector-onnx-embeddings-wasm"];

function copyDir(src, dest) {
  if (!existsSync(src)) {
    throw new Error(`[postbuild] source not found: ${src}`);
  }
  cpSync(src, dest, { recursive: true });
  console.log(`[postbuild] copied ${src} -> ${dest}`);
}

function copyNativeDeps() {
  const standaloneModules = join(standaloneDir, "node_modules");
  mkdirSync(standaloneModules, { recursive: true });

  console.log("[copy-native-deps] Copying native/wasm deps into standalone output...");

  for (const pkg of NATIVE_DEPS) {
    const src = join(workspaceRoot, "node_modules", pkg);
    const dest = join(standaloneModules, pkg);

    if (!existsSync(src)) {
      console.warn(`  [copy-native-deps] WARNING: ${src} not found, skipping`);
      continue;
    }

    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    console.log(`  [copy-native-deps] copied ${pkg}`);
  }

  console.log("[copy-native-deps] Done.");
}

try {
  if (!existsSync(standaloneDir)) {
    throw new Error(
      `[postbuild] ${standaloneDir} not found. Run \`next build\` first (standalone output required).`,
    );
  }

  copyDir(join(workspaceRoot, ".next", "static"), join(standaloneDir, ".next", "static"));
  copyDir(join(workspaceRoot, "public"), join(standaloneDir, "public"));
  copyNativeDeps();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
