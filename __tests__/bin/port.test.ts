// @vitest-environment node
import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findAvailablePort, isPortFree } from "../../bin/port.mjs";

const servers: Server[] = [];

function hold(port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(port, host, () => {
      servers.push(s);
      resolve();
    });
  });
}

/** An ephemeral port that is free right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "0.0.0.0", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve())))
  );
});

describe("isPortFree", () => {
  it("is true for an unused port", async () => {
    expect(await isPortFree(await freePort())).toBe(true);
  });

  it("is false when held on all interfaces", async () => {
    const port = await freePort();
    await hold(port, "0.0.0.0");
    expect(await isPortFree(port)).toBe(false);
  });

  it("is false when held only on loopback (would shadow localhost)", async () => {
    const port = await freePort();
    await hold(port, "127.0.0.1");
    expect(await isPortFree(port)).toBe(false);
  });
});

describe("findAvailablePort", () => {
  it("returns the requested port when it is free", async () => {
    const port = await freePort();
    await expect(findAvailablePort({ port })).resolves.toEqual({ port, movedFromPort: null });
  });

  it("moves to a free port above when taken, and reports the original", async () => {
    const taken = await freePort();
    await hold(taken, "0.0.0.0");
    const result = await findAvailablePort({ port: taken });
    expect(result.movedFromPort).toBe(taken);
    expect(result.port).toBeGreaterThan(taken);
    expect(result.port).toBeLessThanOrEqual(taken + 100);
    expect(await isPortFree(result.port)).toBe(true);
  });

  it("skips a port held only on loopback", async () => {
    const taken = await freePort();
    await hold(taken, "127.0.0.1");
    const result = await findAvailablePort({ port: taken });
    expect(result.movedFromPort).toBe(taken);
    expect(result.port).not.toBe(taken);
  });

  it("throws a one-line error naming the port when explicitly requested and taken", async () => {
    const taken = await freePort();
    await hold(taken, "0.0.0.0");
    const err = await findAvailablePort({ port: taken, explicit: true }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain(String(taken));
    expect(err.message).not.toContain("\n");
  });

  it("throws when no free port exists within the search limit", async () => {
    const taken = await freePort();
    await hold(taken, "0.0.0.0");
    await expect(findAvailablePort({ port: taken, searchLimit: 0 })).rejects.toThrow(
      /No free port found/
    );
  });
});
