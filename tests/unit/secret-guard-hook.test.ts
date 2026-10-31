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

  it("fails closed on malformed input", () => {
    const r = spawnSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("fail closed");
  });
});

// The launcher is what .claude/settings.json actually runs (Windows PowerShell).
describe.runIf(process.platform === "win32")("run-guard.ps1 launcher", () => {
  const launcher = resolve(process.cwd(), ".claude/hooks/run-guard.ps1");
  const ps = `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  const launch = (payload: object, env?: NodeJS.ProcessEnv) =>
    spawnSync(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", launcher], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: env ?? process.env,
    });

  it("blocks and allows through the real launcher", () => {
    expect(launch({ tool_name: "Write", tool_input: { file_path: "C:/p/.env.local" } }).status).toBe(2);
    expect(launch({ tool_name: "Bash", tool_input: { command: "git status" } }).status).toBe(0);
  });

  it("fails closed when Node.js cannot be found", () => {
    const empty = "C:\\does-not-exist";
    const env = {
      SystemRoot: process.env.SystemRoot,
      PATH: `${process.env.SystemRoot}\\System32`,
      ProgramFiles: empty,
      "ProgramFiles(x86)": empty,
      LOCALAPPDATA: empty,
    };
    const r = launch({ tool_name: "Bash", tool_input: { command: "git status" } }, env as NodeJS.ProcessEnv);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("fail closed");
  });
});
