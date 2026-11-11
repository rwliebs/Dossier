#!/usr/bin/env node

/**
 * Dossier CLI entry point.
 *
 * Usage:
 *   npx dossier-agentic-product-planner-builder            — start on default port 3000
 *   npx dossier-agentic-product-planner-builder --port 8080
 *   npx dossier-agentic-product-planner-builder --no-open  — don't open browser
 */

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DEFAULT_PORT, BIND_HOST, findAvailablePort } from "./port.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Port selection lives in ./port.mjs; this just applies the result or exits.
async function resolvePort() {
  try {
    const result = await findAvailablePort({ port, explicit: portExplicit });
    port = result.port;
    movedFromPort = result.movedFromPort;
  } catch (err) {
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let port = DEFAULT_PORT;
let portExplicit = false;
let movedFromPort = null;
let noBrowser = false;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--port" || args[i] === "-p") && args[i + 1]) {
    const raw = args[i + 1];
    port = Number(raw);
    portExplicit = true;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`  Invalid port "${raw}". Use a number from 1 to 65535.`);
      process.exit(1);
    }
    i++;
  } else if (args[i] === "--no-open") {
    noBrowser = true;
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
  Dossier — AI-native product craft platform

  Usage:
    npx dossier-agentic-product-planner-builder [options]

  Options:
    --port, -p <number>   Port to listen on (default: 3000, or the next free port)
    --no-open             Don't open browser automatically
    --help, -h            Show this help message
`);
    process.exit(0);
  }
}

// ---------------------------------------------------------------------------
// Data directory & config
// ---------------------------------------------------------------------------
function getDataDir() {
  if (process.env.DOSSIER_DATA_DIR) return process.env.DOSSIER_DATA_DIR;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return join(home, ".dossier");
}

function loadConfig() {
  const configPath = join(getDataDir(), "config");
  if (!existsSync(configPath)) return;

  const content = readFileSync(configPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// First-run banner
// ---------------------------------------------------------------------------
function printBanner(dataDir, isFirstRun) {
  console.log("");
  console.log("  ┌─────────────────────────────────────┐");
  console.log("  │           D O S S I E R              │");
  console.log("  │   AI-native product craft platform   │");
  console.log("  └─────────────────────────────────────┘");
  console.log("");

  if (isFirstRun) {
    console.log(`  First run detected. Data directory: ${dataDir}`);
    console.log("");
  }

  console.log(`  Starting on http://localhost:${port}`);
  if (movedFromPort !== null) {
    console.log(`  Port ${movedFromPort} is in use, so using ${port} instead.`);
  }
  console.log(`  Data:   ${dataDir}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// Open browser (cross-platform via `open` package)
// ---------------------------------------------------------------------------
async function openBrowser(url) {
  try {
    const open = (await import("open")).default;
    await open(url);
  } catch {
    // Silently fail — user can open the URL manually
  }
}

// ---------------------------------------------------------------------------
// Ensure native addons exist for this platform
// ---------------------------------------------------------------------------
function ensureNativeAddons() {
  const standaloneDir = join(__dirname, "..", ".next", "standalone");
  const sqliteBinary = join(standaloneDir, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");

  let needsInstall = !existsSync(sqliteBinary);

  if (!needsInstall) {
    try {
      const cjsRequire = createRequire(join(standaloneDir, "dummy.js"));
      cjsRequire("better-sqlite3");
    } catch {
      needsInstall = true;
    }
  }

  if (!needsInstall) return;

  console.log("  Installing native dependencies for your platform...");
  try {
    execSync("node " + JSON.stringify(join(__dirname, "postinstall.mjs")), {
      stdio: "inherit",
      env: { ...process.env },
    });
  } catch {
    console.warn("  WARNING: Native dependency install failed. Some features may not work.");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // Check the port before any side effects (data dir, native addons, banner).
  await resolvePort();

  ensureNativeAddons();

  const dataDir = getDataDir();
  const isFirstRun = !existsSync(dataDir);

  // Ensure data directory exists
  mkdirSync(dataDir, { recursive: true });

  // Load config into process.env before starting the server
  loadConfig();

  printBanner(dataDir, isFirstRun);

  // Resolve the standalone server.js
  // In standalone mode, Next.js outputs to .next/standalone/server.js
  const standaloneServer = join(__dirname, "..", ".next", "standalone", "server.js");

  if (!existsSync(standaloneServer)) {
    console.error("  Error: Standalone build not found.");
    console.error("  Run `npm run build` first, or use `npm run dev` for development.");
    console.error("");
    process.exit(1);
  }

  // Start the Next.js standalone server
  const child = spawn("node", [standaloneServer], {
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: BIND_HOST,
      DOSSIER_ALLOW_PROJECT_DEV_SERVER: "1",
    },
    stdio: "inherit",
    cwd: join(__dirname, "..", ".next", "standalone"),
  });

  child.on("error", (err) => {
    console.error(`  Failed to start server: ${err.message}`);
    process.exit(1);
  });

  // Open browser after a short delay to let the server bind
  if (!noBrowser) {
    setTimeout(() => openBrowser(`http://localhost:${port}`), 2000);
  }

  // Forward signals for clean shutdown
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
      process.exit(0);
    });
  }

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
