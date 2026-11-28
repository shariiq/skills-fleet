import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Convert any filesystem path to POSIX forward slashes for cross-machine configs. */
export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/** Normalize a source key (e.g. `mattpocock\\skills` -> `mattpocock/skills`). */
export function normalizeSourceKey(source: string): string {
  return toPosixPath(source).replace(/^\/+|\/+$/g, "");
}

export function readJsonSafe<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function writeJsonPretty(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Safely remove a file, directory, symlink, or Windows junction without
 * traversing into symlink/junction targets.
 */
export function safeRemove(targetPath: string): void {
  if (!existsSync(targetPath)) {
    // Broken symlinks return false for existsSync; check lstatSync just in case.
    try {
      const stat = lstatSync(targetPath);
      if (stat.isSymbolicLink()) unlinkSync(targetPath);
    } catch {
      // Nothing to remove.
    }
    return;
  }

  let stat;
  try {
    stat = lstatSync(targetPath);
  } catch {
    return;
  }

  if (stat.isSymbolicLink()) {
    unlinkSync(targetPath);
    return;
  }

  if (stat.isDirectory()) {
    for (const entry of readdirSync(targetPath)) {
      safeRemove(join(targetPath, entry));
    }
    rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    return;
  }

  unlinkSync(targetPath);
}

export function getHomeDir(): string {
  return homedir();
}

export function getGlobalAgentsDir(homeDir = getHomeDir()): string {
  return resolve(homeDir, ".agents");
}

export function getGlobalSkillsDir(homeDir = getHomeDir()): string {
  return resolve(homeDir, ".agents", "skills");
}

export function getGlobalLockPath(homeDir = getHomeDir()): string {
  return resolve(homeDir, ".agents", ".skill-lock.json");
}

export function getFleetStatePath(homeDir = getHomeDir()): string {
  return resolve(homeDir, ".agents", ".skills-fleet-state.json");
}

/**
 * Identify whether a global `.skill-lock.json` source came from a local
 * skills-fleet checkout (for pruning skills installed by older versions).
 */
export function isFleetLocalSource(source: string | undefined, repoRoot?: string): boolean {
  if (!source) return false;
  const normalized = toPosixPath(source).toLowerCase();
  if (repoRoot) {
    const normalizedRoot = toPosixPath(resolve(repoRoot)).toLowerCase();
    if (normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)) {
      return true;
    }
  }
  return /(?:^|\/)skills-fleet\/(?:skills|\.agents)(?:\/|$)/i.test(normalized);
}

/** Compute a deterministic SHA-256 digest of all files inside a skill directory. */
export function computeDirectoryHash(dirPath: string): string {
  const hash = createHash("sha256");
  if (!existsSync(dirPath)) return "";

  function walk(currentDir: string, prefix: string): void {
    const entries = readdirSync(currentDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        hash.update(relPath);
        hash.update("\0");
        hash.update(readFileSync(fullPath));
        hash.update("\0");
      }
    }
  }

  walk(dirPath, "");
  return hash.digest("hex");
}
