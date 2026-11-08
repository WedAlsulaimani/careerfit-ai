import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Guards against a migration that defines the same objects twice (the initial
// schema once shipped with its whole body duplicated, so it could not be applied).
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

const OBJECT_PATTERN =
  /\bcreate\s+(?:or\s+replace\s+)?(table|index|trigger|function|extension|policy)\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)/gi;

function duplicateObjects(sql: string): string[] {
  // Strip SQL line comments so commented-out statements are not counted.
  const code = sql.replace(/--.*$/gm, "");
  const seen = new Map<string, number>();
  for (const match of code.matchAll(OBJECT_PATTERN)) {
    const name = match[2];
    // Names containing % come from format() strings inside DO blocks, which are generated per call.
    if (name.includes("%")) continue;
    const key = `${match[1].toLowerCase()} ${name.toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([key, count]) => `${key} x${count}`);
}

describe("database migrations", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

  it("contains at least one migration", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} defines every table, index, policy and function exactly once`, () => {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
      expect(duplicateObjects(sql)).toEqual([]);
    });
  }

  it("detects a duplicated migration body (self-check of the guard)", () => {
    const body = "create table public.profiles (id uuid);\ncreate policy p on public.profiles for select using (true);\n";
    expect(duplicateObjects(body + body)).toEqual(["table public.profiles x2", "policy p x2"]);
  });
});
