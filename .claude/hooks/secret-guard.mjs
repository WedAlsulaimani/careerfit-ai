#!/usr/bin/env node
// PreToolUse hook: blocks tool calls that could leak secrets into the repository.
// Exit 0 = allow, exit 2 = block (stderr is shown to Claude). Reads the hook JSON from stdin.
// Started through run-guard.ps1, which also blocks when Node.js cannot be found or run.
import { basename } from "node:path";

const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_-]{35}/, "Google/Gemini API key"],
  [/sk-ant-[A-Za-z0-9_-]{20,}/, "Anthropic API key"],
  [/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/, "JWT (e.g. Supabase service-role key)"],
];

const isSecretEnvFile = (p) => /^\.env(\..+)?$/.test(basename(p || "")) && basename(p) !== ".env.example";

function violation(tool, input) {
  const path = input.file_path || input.notebook_path;
  if (path && isSecretEnvFile(path)) return `writing to ${basename(path)} is blocked; edit .env.local yourself`;

  const text = [input.content, input.new_string, input.command].filter((v) => typeof v === "string").join("\n");
  const isExampleFile = path && basename(path) === ".env.example";
  if (!isExampleFile) {
    for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) return `content looks like a ${label}`;
  }

  const cmd = input.command;
  if (typeof cmd === "string") {
    const git = cmd.match(/\bgit\s+(add|commit)\b[^\n;|&]*/g) || [];
    for (const part of git) {
      if (/(^|[\s/\\])\.env(\.(?!example\b)[\w.-]+)?(\s|$)/.test(part)) return "staging a .env file is blocked";
      if (/\bgit\s+add\b.*(\s-f\b|--force)/.test(part)) return "git add --force is blocked (it bypasses .gitignore)";
    }
  }
  return null;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let reason;
  try {
    const event = JSON.parse(raw.replace(/^﻿/, ""));
    reason = violation(event.tool_name, event.tool_input || {});
  } catch {
    // Fail closed: input we cannot evaluate is never allowed through.
    process.stderr.write("secret-guard: could not evaluate the tool call, blocking (fail closed).\n");
    process.exit(2);
  }
  if (reason) {
    process.stderr.write(`secret-guard: ${reason}. Secrets belong in .env.local (git-ignored), never in tracked files.\n`);
    process.exit(2);
  }
  process.exit(0);
});
