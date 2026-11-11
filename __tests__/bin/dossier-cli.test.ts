// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../../bin/dossier.mjs", import.meta.url));

let heldServer: Server;
let heldPort: number;
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "dossier-cli-test-"));
  heldServer = createServer();
  await new Promise<void>((resolve, reject) => {
    heldServer.once("error", reject);
    heldServer.listen(0, "0.0.0.0", () => resolve());
  });
  heldPort = (heldServer.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => heldServer.close(() => resolve()));
});

/** Runs the CLI in failure modes only, so no server is spawned. */
function runCli(args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args, "--no-open"], {
    encoding: "utf-8",
    env: { ...process.env, DOSSIER_DATA_DIR: dataDir },
    timeout: 20_000,
  });
}

function expectOneLineError(stderr: string) {
  const lines = stderr.trim().split("\n");
  expect(lines).toHaveLength(1);
  expect(stderr).not.toMatch(/EADDRINUSE|Error:|\n\s+at /);
  return lines[0];
}

describe("dossier CLI port handling", () => {
  it("exits 1 with one line naming the port when --port is taken", () => {
    const res = runCli(["--port", String(heldPort)]);
    expect(res.status).toBe(1);
    expect(expectOneLineError(res.stderr)).toContain(String(heldPort));
  });

  it("exits 1 with one line for a non-numeric port", () => {
    const res = runCli(["--port", "abc"]);
    expect(res.status).toBe(1);
    expect(expectOneLineError(res.stderr)).toContain('"abc"');
  });

  it("exits 1 with one line for an out-of-range port", () => {
    const res = runCli(["--port", "70000"]);
    expect(res.status).toBe(1);
    expect(expectOneLineError(res.stderr)).toContain('"70000"');
  });
});
