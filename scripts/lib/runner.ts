import { spawnSync } from "node:child_process";

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  cwd?: string;
  capture?: boolean;
  allowFailure?: boolean;
}

export function runCommand(
  cmd: string,
  args: string[],
  options: RunCommandOptions = {},
): CommandResult {
  const { cwd = process.cwd(), capture = false, allowFailure = false } = options;

  const result = spawnSync(cmd, args, {
    cwd,
    stdio: capture ? "pipe" : "inherit",
    encoding: "utf-8",
    // bunx on Windows may be a .cmd/.exe shim resolved through PATH
    shell: process.platform === "win32" && cmd === "bunx",
  });

  const status = result.status ?? 1;
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";

  if (result.error) {
    if (allowFailure) return { status: 1, stdout, stderr: result.error.message };
    throw new Error(`Failed to execute "${cmd} ${args.join(" ")}": ${result.error.message}`);
  }

  if (status !== 0 && !allowFailure) {
    const detail = stderr.trim() || stdout.trim();
    throw new Error(
      `Command failed (exit ${status}): ${cmd} ${args.join(" ")}${detail ? `\n${detail}` : ""}`,
    );
  }

  return { status, stdout, stderr };
}

export function runSkillsCli(
  args: string[],
  options: Omit<RunCommandOptions, "capture"> = {},
): CommandResult {
  return runCommand("bunx", ["skills", ...args], options);
}

export function runGit(
  args: string[],
  options: RunCommandOptions = {},
): CommandResult {
  return runCommand("git", args, options);
}
