/**
 * Port selection for the Dossier CLI.
 *
 * Kept separate from bin/dossier.mjs so it can be unit-tested directly.
 */

import { createServer } from "node:net";

export const DEFAULT_PORT = 3000;
// How many ports above the requested one to try before giving up.
export const PORT_SEARCH_LIMIT = 100;
// Must match the host the standalone server binds to (HOSTNAME in dossier.mjs).
export const BIND_HOST = "0.0.0.0";
const LOOPBACK_HOST = "127.0.0.1";

function canBind(candidate, host) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(candidate, host);
  });
}

/**
 * Resolves true if candidate is free on both the server's bind host and
 * loopback. Checking loopback too matters on macOS: a process bound only to
 * 127.0.0.1 doesn't block a 0.0.0.0 bind, but it would shadow localhost.
 */
export async function isPortFree(candidate) {
  // Probe one host at a time. On Linux a listener on 0.0.0.0:P and a bind to
  // 127.0.0.1:P conflict, so probing both concurrently makes every port look
  // taken (the probe that listens first blocks the other).
  for (const host of [BIND_HOST, LOOPBACK_HOST]) {
    if (!(await canBind(candidate, host))) return false;
  }
  return true;
}

/**
 * Returns the port to listen on.
 *
 * - If `port` is free, returns it with movedFromPort: null.
 * - If taken and `explicit` (the user passed --port), throws a one-line Error.
 * - If taken otherwise, returns the next free port within `searchLimit`,
 *   with movedFromPort set to the requested port.
 */
export async function findAvailablePort({
  port,
  explicit = false,
  searchLimit = PORT_SEARCH_LIMIT,
}) {
  if (await isPortFree(port)) {
    return { port, movedFromPort: null };
  }

  if (explicit) {
    throw new Error(
      `Port ${port} is already in use. Stop the other process or choose another with --port.`
    );
  }

  const last = Math.min(port + searchLimit, 65535);
  for (let candidate = port + 1; candidate <= last; candidate++) {
    if (await isPortFree(candidate)) {
      return { port: candidate, movedFromPort: port };
    }
  }

  throw new Error(
    `No free port found from ${port} to ${last}. Stop another instance or use --port.`
  );
}
