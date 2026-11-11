import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "@/lib/db/migrate";

// lib/db/migrate.ts embeds the migrations and is what runs at startup.
// lib/db/sqlite-migrations/ mirrors them so the schema is readable as SQL.
// This test fails if the two drift apart.

const DIR = join(process.cwd(), "lib", "db", "sqlite-migrations");

/** SQL with comments and whitespace removed, for comparing statements. */
function semantic(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("sqlite migrations parity", () => {
  it.each(MIGRATIONS.map((m) => [m.name, m.sql] as const))(
    "%s matches the embedded migration",
    (name, sql) => {
      const path = join(DIR, name);
      expect(existsSync(path), `missing ${path}`).toBe(true);
      expect(semantic(readFileSync(path, "utf-8"))).toBe(semantic(sql));
    }
  );

  it("has no SQL files that are not embedded", () => {
    const embedded = new Set(MIGRATIONS.map((m) => m.name));
    const extra = readdirSync(DIR).filter((f) => f.endsWith(".sql") && !embedded.has(f));
    expect(extra).toEqual([]);
  });
});
