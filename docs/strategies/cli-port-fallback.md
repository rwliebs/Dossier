# Strategy: CLI Port Selection (Port-in-Use Handling)

## Context

`bin/dossier.mjs` starts the standalone Next.js server on port 3000 by default. If that port is taken (for example by a second Dossier instance), the standalone server fails with a raw `EADDRINUSE` stack trace.

Goal: two Dossier instances can run side by side, and neither shows a stack trace.

## Decision

1. **Probe before starting.** Before spawning the server, bind throwaway `net` servers to `0.0.0.0:<port>` (the host the standalone server binds to, `HOSTNAME=0.0.0.0`) and to `127.0.0.1:<port>`. The port is free only if both succeed. On macOS a process bound only to `127.0.0.1` does not block a `0.0.0.0` bind, but it shadows `localhost`, so loopback must be checked too.
2. **Default port, no `--port`:** move to the next free port (up to 100 above 3000) and print a line naming the original and new ports.
3. **Explicit `--port`, taken:** exit 1 with a single line naming the port. No fallback, because the user asked for that port specifically.
4. **Invalid `--port` value** (non-numeric, outside 1–65535): exit 1 with a single line. This prevents `PORT=NaN` from reaching Next.js and producing the same raw error.

## Principles

- An explicit `--port` is never silently changed.
- Errors are one human-readable line, never a stack trace.
- The probe checks the same address the server binds to, so its result matches what Next.js experiences.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Race: another process takes the port between probe and server bind | Window is milliseconds. Accepted; a rare race would still surface a Next.js error, not a silent hang. |
| Probe passes but Next.js binds differently | Probe covers `0.0.0.0`, identical to the `HOSTNAME` passed to the child, plus `127.0.0.1`, which is where `localhost` resolves. |
| Fallback hides a misconfiguration | The chosen port is printed in the banner, with an explicit "in use, so using N instead" line. |
| Many instances exhaust the range | Search is bounded at 100 ports; exits with a one-line message if none are free. |

## Out of Scope

- Changing the Next.js standalone server's own error output on a race.
- Changing the data directory: two instances share `~/.dossier` unless `DOSSIER_DATA_DIR` is set. Revisit if concurrent SQLite access becomes a problem.
