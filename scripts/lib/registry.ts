import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseSkillFrontmatterFromFile } from "./frontmatter.ts";
import { isFleetLocalSource, normalizeSourceKey } from "./fs-utils.ts";
import type {
  FleetConfig,
  FleetMachineState,
  GlobalSkillLock,
  GlobalSyncPlan,
  SkillMetadata,
  SkillRegistryMeta,
  SkillsLock,
  SourceRegistryEntry,
  UpstreamInstallBatch,
} from "./types.ts";

export const CUSTOM_SOURCE_KEY = "custom";
export const CUSTOM_SOURCE_PATH = "skills/custom";

/** Scan a directory of `<skillName>/SKILL.md` folders (such as `skills/custom` or `.agents/skills`). */
export function scanSkillsDirectory(dirPath: string): Map<string, SkillMetadata> {
  const result = new Map<string, SkillMetadata>();
  if (!existsSync(dirPath)) return result;

  const entries = readdirSync(dirPath, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillMd = join(dirPath, entry.name, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    const meta = parseSkillFrontmatterFromFile(skillMd, entry.name);
    meta.name = entry.name;
    result.set(entry.name, meta);
  }

  return result;
}

export interface BuildFleetConfigInput {
  lock: SkillsLock | null;
  existingConfig: FleetConfig | null;
  customSkills: Map<string, SkillMetadata>;
  stagedSkills?: Map<string, SkillMetadata>;
}

/**
 * Build a deterministic, OS-independent FleetConfig from `skills-lock.json`
 * and `skills/custom/`, preserving cached skill descriptions across machines.
 */
export function buildFleetConfig({
  lock,
  existingConfig,
  customSkills,
  stagedSkills,
}: BuildFleetConfigInput): FleetConfig {
  const grouped = new Map<string, Set<string>>();
  const skillSources = new Map<string, string>();

  if (lock?.skills) {
    for (const [skillName, entry] of Object.entries(lock.skills)) {
      const source = normalizeSourceKey(entry.source || "local");
      if (!grouped.has(source)) grouped.set(source, new Set());
      grouped.get(source)!.add(skillName);
      skillSources.set(skillName, source);
    }
  }

  if (customSkills.size > 0) {
    if (!grouped.has(CUSTOM_SOURCE_KEY)) grouped.set(CUSTOM_SOURCE_KEY, new Set());
    for (const skillName of customSkills.keys()) {
      grouped.get(CUSTOM_SOURCE_KEY)!.add(skillName);
      skillSources.set(skillName, CUSTOM_SOURCE_KEY);
    }
  }

  const sources: Record<string, SourceRegistryEntry> = {};
  for (const source of [...grouped.keys()].sort((a, b) => a.localeCompare(b))) {
    const skillList = [...grouped.get(source)!].sort((a, b) => a.localeCompare(b));
    sources[source] =
      source === CUSTOM_SOURCE_KEY
        ? { path: CUSTOM_SOURCE_PATH, skills: skillList }
        : { skills: skillList };
  }

  const skills: Record<string, SkillRegistryMeta> = {};
  for (const skillName of [...skillSources.keys()].sort((a, b) => a.localeCompare(b))) {
    const source = skillSources.get(skillName)!;
    const fromCustom = customSkills.get(skillName);
    const fromStaged = stagedSkills?.get(skillName);
    const fromExisting = existingConfig?.skills?.[skillName];

    const description =
      fromStaged?.description ||
      fromCustom?.description ||
      fromExisting?.description ||
      "";
    const argumentHint =
      fromStaged?.argumentHint ||
      fromCustom?.argumentHint ||
      fromExisting?.argumentHint ||
      "";

    const meta: SkillRegistryMeta = { source };
    if (description) meta.description = description;
    if (argumentHint) meta.argumentHint = argumentHint;
    skills[skillName] = meta;
  }

  return {
    name: existingConfig?.name || "skills-fleet",
    version: existingConfig?.version || "1.0.0",
    description: existingConfig?.description || "Central registry for managed AI agent skills",
    sources,
    skills,
  };
}

function formatSkillLink(
  source: string,
  skillName: string,
  lock: SkillsLock | null,
): string {
  if (source === CUSTOM_SOURCE_KEY) {
    return `./${CUSTOM_SOURCE_PATH}/${skillName}/SKILL.md`;
  }
  const entry = lock?.skills?.[skillName];
  const ref = entry?.commit || entry?.ref || "main";
  if (entry?.skillPath) {
    const cleanPath = entry.skillPath.replace(/^\/+/, "");
    return `https://github.com/${source}/blob/${ref}/${cleanPath}`;
  }
  return `https://github.com/${source}`;
}

function truncateDescription(raw: string | undefined, maxLength = 120): string {
  if (!raw) return "—";
  const collapsed = raw.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
  if (!collapsed) return "—";
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength - 3).trimEnd()}...`;
}

/** Render deterministic Markdown catalog using POSIX paths and upstream GitHub links. */
export function generateCatalogMarkdown(
  config: FleetConfig,
  lock: SkillsLock | null,
): string {
  const lines: string[] = [
    "# Skills Fleet Catalog",
    "",
    "> Managed AI agent skills registry grouped by source.",
    "",
  ];

  const sourceKeys = Object.keys(config.sources).sort((a, b) => a.localeCompare(b));
  if (sourceKeys.length === 0) {
    lines.push(
      "No skills are currently registered in this fleet.",
      "",
      "Add skills using:",
      "```bash",
      "bun run fleet:add <source> [skills...]",
      "```",
      "",
    );
    return lines.join("\n");
  }

  const totalSkills = sourceKeys.reduce(
    (sum, src) => sum + (config.sources[src]?.skills.length ?? 0),
    0,
  );
  lines.push(`**Total**: ${totalSkills} skills across ${sourceKeys.length} sources.`, "");

  for (const source of sourceKeys) {
    const group = config.sources[source];
    lines.push(`## ${source}`);
    if (source === CUSTOM_SOURCE_KEY) {
      lines.push(`- **Location**: \`${group.path || CUSTOM_SOURCE_PATH}/\``);
    } else {
      lines.push(`- **Repository**: [github.com/${source}](https://github.com/${source})`);
    }
    lines.push(`- **Total Skills**: ${group.skills.length}`);
    lines.push("");
    lines.push("| Skill | Description | Argument Hint |");
    lines.push("| --- | --- | --- |");

    const sortedSkills = group.skills.slice().sort((a, b) => a.localeCompare(b));
    for (const skillName of sortedSkills) {
      const meta = config.skills[skillName];
      const link = formatSkillLink(source, skillName, lock);
      const desc = truncateDescription(meta?.description);
      const arg = (meta?.argumentHint || "—").replace(/\|/g, "\\|");
      lines.push(`| [${skillName}](${link}) | ${desc} | \`${arg}\` |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export interface ComputeGlobalSyncPlanInput {
  config: FleetConfig;
  lock: SkillsLock | null;
  globalLock: GlobalSkillLock | null;
  installedGlobalDirs: Set<string>;
  machineState: FleetMachineState | null;
  customSkillHashes?: Record<string, string>;
  repoRoot: string;
  force?: boolean;
}

function isUpstreamSkillUpToDate(
  canonicalSource: string,
  lockEntry: SkillsLock["skills"][string] | undefined,
  globalEntry: GlobalSkillLock["skills"][string] | undefined,
  isPresent: boolean,
): boolean {
  if (!isPresent || !globalEntry) return false;
  if (globalEntry.sourceType === "local") return false;
  if (normalizeSourceKey(globalEntry.source || "") !== canonicalSource) return false;

  // Global v3 lock records `commit` when installed from GitHub; project v2 lock records `commit` + SHA-256 `computedHash`.
  if (lockEntry?.commit && globalEntry.commit) {
    return globalEntry.commit === lockEntry.commit;
  }
  if (lockEntry?.computedHash && globalEntry.skillFolderHash) {
    return globalEntry.skillFolderHash === lockEntry.computedHash;
  }
  return false;
}

/**
 * Compute minimal batched install & prune operations so the current machine's
 * global skills match the fleet registry with zero redundant clones.
 */
export function computeGlobalSyncPlan({
  config,
  lock,
  globalLock,
  installedGlobalDirs,
  machineState,
  customSkillHashes,
  repoRoot,
  force = false,
}: ComputeGlobalSyncPlanInput): GlobalSyncPlan {
  const desiredSkills = new Set<string>();
  const batchMap = new Map<string, UpstreamInstallBatch>();
  const customSkills: string[] = [];
  let upToDateCount = 0;

  for (const [source, group] of Object.entries(config.sources)) {
    for (const skillName of group.skills) {
      desiredSkills.add(skillName);
      const isPresent = installedGlobalDirs.has(skillName);

      if (source === CUSTOM_SOURCE_KEY) {
        const expectedHash = customSkillHashes?.[skillName];
        const recordedHash = machineState?.customHashes?.[skillName];
        if (!force && isPresent && expectedHash && recordedHash === expectedHash) {
          upToDateCount++;
        } else {
          customSkills.push(skillName);
        }
        continue;
      }

      const lockEntry = lock?.skills?.[skillName];
      const canonicalSource = normalizeSourceKey(lockEntry?.source || source);
      const globalEntry = globalLock?.skills?.[skillName];

      if (!force && isUpstreamSkillUpToDate(canonicalSource, lockEntry, globalEntry, isPresent)) {
        upToDateCount++;
        continue;
      }

      const commit = lockEntry?.commit;
      const batchKey = `${canonicalSource}#${commit || ""}`;
      if (!batchMap.has(batchKey)) {
        batchMap.set(batchKey, {
          source: canonicalSource,
          commit,
          skills: [],
        });
      }
      batchMap.get(batchKey)!.skills.push(skillName);
    }
  }

  // Prune skills previously managed by skills-fleet (via state file or legacy local lock entries).
  const previouslyManaged = new Set<string>(machineState?.installedSkills || []);
  if (globalLock?.skills) {
    for (const [skillName, entry] of Object.entries(globalLock.skills)) {
      if (isFleetLocalSource(entry.source, repoRoot) || isFleetLocalSource(entry.sourceUrl, repoRoot)) {
        previouslyManaged.add(skillName);
      }
    }
  }

  const toRemove = [...previouslyManaged]
    .filter((skill) => !desiredSkills.has(skill))
    .sort((a, b) => a.localeCompare(b));

  const upstreamBatches = [...batchMap.values()]
    .map((batch) => ({
      ...batch,
      skills: batch.skills.slice().sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.source.localeCompare(b.source));

  customSkills.sort((a, b) => a.localeCompare(b));

  return {
    toRemove,
    upstreamBatches,
    customSkills,
    upToDateCount,
  };
}
