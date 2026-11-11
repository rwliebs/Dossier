// Cross-platform replacement for inline `VAR=value command` syntax in npm scripts,
// which does not work in Windows cmd.exe or PowerShell.
//
// Usage:
//   node scripts/run-with-env.mjs VAR=value [VAR2=value2 ...] -- <command> [args...]

import { spawn } from "node:child_process";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");

if (sep === -1 || sep === argv.length - 1) {
  console.error("Usage: node scripts/run-with-env.mjs VAR=value ... -- <command> [args...]");
  process.exit(1);
}

const assignments = argv.slice(0, sep);
const [command, ...args] = argv.slice(sep + 1);

const env = { ...process.env };
for (const assignment of assignments) {
  const eq = assignment.indexOf("=");
  if (eq <= 0) {
    console.error(`Invalid environment assignment: ${assignment}`);
    process.exit(1);
  }
  env[assignment.slice(0, eq)] = assignment.slice(eq + 1);
}

const stdio = "inherit";

// cmd.exe splits arguments on whitespace, so quote any argument that contains
// whitespace or a double quote (embedded quotes are doubled, per cmd convention).
function quoteForCmd(arg) {
  if (!/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

// Windows bins installed by npm are .cmd shims, which need a shell to launch.
const child =
  process.platform === "win32"
    ? spawn([command, ...args.map(quoteForCmd)].join(" "), { stdio, env, shell: true })
    : spawn(command, args, { stdio, env });

child.on("error", (err) => {
  console.error(`[run-with-env] failed to start "${command}": ${err.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
