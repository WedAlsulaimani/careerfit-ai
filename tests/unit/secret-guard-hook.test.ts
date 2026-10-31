import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HOOK = resolve(process.cwd(), ".claude/hooks/secret-guard.mjs");

function run(tool_name: string, tool_input: Record<string, unknown>) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name, tool_input }), encoding: "utf8" });
  return { code: r.status, stderr: r.stderr };
}

// Fake keys are assembled at runtime so this file never contains a key-shaped literal.
const fakeGemini = "AIza" + "x".repeat(35);
const fakeAnthropic = "sk-ant-" + "a".repeat(30);

describe("secret-guard PreToolUse hook", () => {
  it("blocks writes to .env.local and .env.production", () => {
    expect(run("Write", { file_path: "/p/.env.local", content: "A=1" }).code).toBe(2);
    expect(run("Edit", { file_path: "C:\\p\\.env.production", new_string: "A=1" }).code).toBe(2);
  });

  it("allows .env.example and ordinary source files", () => {
    expect(run("Write", { file_path: "/p/.env.example", content: "GEMINI_API_KEY=" }).code).toBe(0);
    expect(run("Write", { file_path: "/p/src/a.ts", content: "export const a = 1;" }).code).toBe(0);
  });

  it("blocks key-shaped content outside .env.example", () => {
    expect(run("Write", { file_path: "/p/src/a.ts", content: `const k = "${fakeGemini}"` }).code).toBe(2);
    expect(run("Bash", { command: `echo ${fakeAnthropic}` }).code).toBe(2);
    expect(run("Write", { file_path: "/p/.env.example", content: `K=${fakeGemini}` }).code).toBe(0);
  });

  it("blocks staging env files and forced adds, but not .env.example", () => {
    expect(run("Bash", { command: "git add .env.local" }).code).toBe(2);
    expect(run("PowerShell", { command: "git add -A; git add -f build.log" }).code).toBe(2);
    expect(run("Bash", { command: "git add .env.example src/lib" }).code).toBe(0);
    expect(run("Bash", { command: "git status" }).code).toBe(0);
  });

  it("still blocks when the JSON starts with a UTF-8 BOM (Windows PowerShell pipes add one)", () => {
    const payload = "﻿" + JSON.stringify({ tool_name: "Write", tool_input: { file_path: "/p/.env.local" } });
    expect(spawnSync(process.execPath, [HOOK], { input: payload, encoding: "utf8" }).status).toBe(2);
  });

  it("fails open on malformed input", () => {
    const r = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
    expect(r.status).toBe(0);
  });
});
