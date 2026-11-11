// Rebuild and restart the Dossier server on port 3000.
// Cross-platform replacement for scripts/rebuild-and-restart.sh.
//
// Steps: free port 3000 -> `npm run build` -> start the server.
//
// Usage:
//   node scripts/rebuild-and-restart.mjs         # dev server (default)
//   node scripts/rebuild-and-restart.mjs prod    # production server (next start)
//   node scripts/rebuild-and-restart.mjs bg      # dev server in background

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3000;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";
const mode = process.argv[2] ?? "";

// Returns the PIDs listening on or connected to the port, or null if the
// lookup tool is unavailable on this machine.
function pidsOnPort(port) {
  if (IS_WIN) {
    let out;
    try {
      out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
    } catch {
      return null;
    }
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      // Columns: Proto, Local Address, Foreign Address, State, PID
      const cols = line.trim().split(/\s+/);
      if (cols.length >= 5 && cols[0] === "TCP" && cols[1].endsWith(`:${port}`) && cols[3] === "LISTENING") {
        pids.add(Number(cols[4]));
      }
    }
    return [...pids];
  }

  try {
    // Attached form (-ti:PORT): with a space, lsof treats ":PORT" as a file path.
    const out = execFileSync("lsof", [`-ti:${port}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split(/\s+/).filter(Boolean).map(Number);
  } catch (err) {
    // lsof exits 1 when nothing matches; ENOENT means lsof is not installed.
    return err.code === "ENOENT" ? null : [];
  }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

// On Windows, npm is npm.cmd, which only launches through a shell.
function npmCommand(args) {
  return IS_WIN ? [["npm", ...args].join(" "), []] : ["npm", args];
}

function npmSync(args) {
  const [cmd, cmdArgs] = npmCommand(args);
  return spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: ROOT, shell: IS_WIN });
}

function npmSpawn(args, options) {
  const [cmd, cmdArgs] = npmCommand(args);
  return spawn(cmd, cmdArgs, { cwd: ROOT, shell: IS_WIN, ...options });
}

async function main() {
  console.log(`==> Killing process on port ${PORT} (if any)...`);
  const pids = pidsOnPort(PORT);
  if (pids === null) {
    console.log("    lsof/netstat not found; skipping kill (start may fail if port is in use)");
  } else if (pids.length === 0) {
    console.log(`    No process found on port ${PORT}`);
  } else {
    for (const pid of pids) {
      try {
        process.kill(pid, IS_WIN ? undefined : "SIGKILL");
      } catch {
        // Process already exited.
      }
    }
    console.log(`    Killed PID(s): ${pids.join(" ")}`);
    console.log("    Waiting for port to release...");
    for (let i = 0; i < 10 && pidsOnPort(PORT)?.length; i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (pidsOnPort(PORT)?.length) {
      console.error(`    ERROR: Port ${PORT} still in use after 10s`);
      process.exit(1);
    }
  }

  console.log("==> Building...");
  const build = npmSync(["run", "build"]);
  if (build.status !== 0) {
    console.error("==> Build failed; server not started.");
    process.exit(build.status ?? 1);
  }

  console.log("==> Starting server...");
  if (mode === "bg") {
    const logPath = join(tmpdir(), "dossier-dev.log");
    const logFd = openSync(logPath, "w");
    const child = npmSpawn(["run", "dev"], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    });
    child.unref();
    console.log(`    Dev server starting in background (logs: ${logPath})`);
    console.log("    Waiting for server to be ready (up to 30s)...");
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await isPortOpen(PORT)) {
        console.log(`    Ready at http://localhost:${PORT}`);
        return;
      }
    }
    console.log(`    WARN: Server may still be compiling. Check ${logPath}`);
    return;
  }

  const script = mode === "prod" ? ["run", "start"] : ["run", "dev"];
  const child = npmSpawn(script, { stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
}

main();
