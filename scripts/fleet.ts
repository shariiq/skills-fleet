import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  computeDirectoryHash,
  getFleetStatePath,
  getGlobalLockPath,
  getGlobalSkillsDir,
  getHomeDir,
  isFleetLocalSource,
  normalizeSourceKey,
  readJsonSafe,
  safeRemove,
  writeJsonPretty,
} from "./lib/fs-utils.ts";
import {
  buildFleetConfig,
  CUSTOM_SOURCE_KEY,
  CUSTOM_SOURCE_PATH,
  computeGlobalSyncPlan,
  generateCatalogMarkdown,
  scanSkillsDirectory,
} from "./lib/registry.ts";
import { runGit, runSkillsCli } from "./lib/runner.ts";
import type {
  FleetConfig,
  FleetMachineState,
  GlobalSkillLock,
  SkillMetadata,
  SkillsLock,
} from "./lib/types.ts";

const ROOT_DIR = process.cwd();
const CONFIG_PATH = resolve(ROOT_DIR, "skills-fleet.config.json");
const LOCK_PATH = resolve(ROOT_DIR, "skills-lock.json");
const CATALOG_PATH = resolve(ROOT_DIR, "CATALOG.md");
const STAGING_AGENTS_DIR = resolve(ROOT_DIR, ".agents");
const STAGING_SKILLS_DIR = resolve(STAGING_AGENTS_DIR, "skills");
const CUSTOM_SKILLS_DIR = resolve(ROOT_DIR, CUSTOM_SOURCE_PATH);

const LOCAL_DUMMY_MIRRORS = [
  "agent",
  ".claude",
  ".crush",
  ".devin",
  ".goose",
  ".kimchi",
  ".openclaw",
];

const KNOWN_GLOBAL_HARNESS_DIRS = [
  ".adal",
  ".aider-desk",
  ".astrbot",
  ".augment",
  ".autohand",
  ".bob",
  ".claude",
  ".codeartsdoer",
  ".codebuddy",
  ".codeium",
  ".codemaker",
  ".codestudio",
  ".commandcode",
  ".continue",
  ".forge",
  ".grok",
  ".hermes",
  ".iflow",
  ".inferencesh",
  ".jazz",
  ".junie",
  ".kiro",
  ".kode",
  ".lingma",
  ".mcpjam",
  ".minimax",
  ".moxby",
  ".mux",
  ".neovate",
  ".ona",
  ".openclaw",
  ".openhands",
  ".pochi",
  ".posit",
  ".qoder",
  ".qoder-cn",
  ".qwen",
  ".reasonix",
  ".roo",
  ".rovodev",
  ".snowflake",
  ".tabnine",
  ".terramind",
  ".tinycloud",
  ".trae",
  ".trae-cn",
  ".vibe",
  ".zcode",
  ".zencoder",
];

function loadLock(): SkillsLock {
  const lock = readJsonSafe<SkillsLock>(LOCK_PATH);
  if (lock && typeof lock.skills === "object" && lock.skills !== null) {
    return lock;
  }
  return { version: 2, skills: {} };
}

function saveLock(lock: SkillsLock): void {
  const sortedSkills: Record<string, SkillsLock["skills"][string]> = {};
  for (const key of Object.keys(lock.skills).sort((a, b) => a.localeCompare(b))) {
    sortedSkills[key] = lock.skills[key];
  }
  writeJsonPretty(LOCK_PATH, { version: lock.version ?? 2, skills: sortedSkills });
}

function loadConfig(): FleetConfig {
  const raw = readJsonSafe<Partial<FleetConfig>>(CONFIG_PATH);
  return {
    name: raw?.name || "skills-fleet",
    version: raw?.version || "1.0.0",
    description: raw?.description || "Central registry for managed AI agent skills",
    sources: raw?.sources || {},
    skills: raw?.skills || {},
  };
}

function cleanLocalStaging(): void {
  safeRemove(STAGING_AGENTS_DIR);
  for (const dummy of LOCAL_DUMMY_MIRRORS) {
    safeRemove(resolve(ROOT_DIR, dummy));
  }
}

export function cleanDummyHarnesses(): void {
  console.log("\nScanning for dummy agent harness folders...");

  const home = getHomeDir();
  const removed: string[] = [];

  for (const name of KNOWN_GLOBAL_HARNESS_DIRS) {
    const dir = join(home, name);
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir);
      const isDummyOnly =
        entries.length === 0 ||
        (entries.length === 1 &&
          ["skills", "data", "assistant", "windsurf", "cortex", "agent"].includes(entries[0]));

      if (isDummyOnly) {
        safeRemove(dir);
        removed.push(`~/${name}`);
      } else {
        console.log(`Skipped ~/${name} (contains user configuration files)`);
      }
    } catch {
      // Ignore permission errors on protected directories.
    }
  }

  for (const name of LOCAL_DUMMY_MIRRORS) {
    const dir = join(ROOT_DIR, name);
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir);
      if (entries.length === 0 || (entries.length === 1 && entries[0] === "skills")) {
        safeRemove(dir);
        removed.push(`./${name}`);
      }
    } catch {
      // Ignore transient errors.
    }
  }

  if (removed.length === 0) {
    console.log("No dummy harness folders found.");
  } else {
    console.log(`Removed ${removed.length} dummy harness folder(s): ${removed.join(", ")}`);
  }
}

export function organize(options: { keepStaging?: boolean } = {}): FleetConfig {
  const lock = loadLock();
  const existingConfig = loadConfig();
  const customSkills = scanSkillsDirectory(CUSTOM_SKILLS_DIR);
  const stagedSkills: Map<string, SkillMetadata> = existsSync(STAGING_SKILLS_DIR)
    ? scanSkillsDirectory(STAGING_SKILLS_DIR)
    : new Map();

  const nextConfig = buildFleetConfig({
    lock,
    existingConfig,
    customSkills,
    stagedSkills,
  });

  if (!options.keepStaging) {
    cleanLocalStaging();
  }

  writeJsonPretty(CONFIG_PATH, nextConfig);
  writeFileSync(CATALOG_PATH, generateCatalogMarkdown(nextConfig, lock), "utf-8");

  console.log(
    `Organized ${Object.keys(nextConfig.skills).length} skill(s) across ${Object.keys(nextConfig.sources).length} source(s).`,
  );
  return nextConfig;
}

function listFleet(): void {
  const config = loadConfig();
  const totalSkills = Object.values(config.sources).reduce((sum, s) => sum + s.skills.length, 0);

  console.log(`\nSkills Fleet: ${config.name} (v${config.version})`);
  console.log(`${config.description}\n`);

  const entries = Object.entries(config.sources);
  if (entries.length === 0) {
    console.log("No skills registered in this fleet yet.");
    console.log("Run: bun run fleet:add <source> [skills...]\n");
    return;
  }

  console.log(`Managed Skills (${totalSkills} skills, ${entries.length} sources):`);
  for (const [source, data] of entries) {
    const tag = source === CUSTOM_SOURCE_KEY ? `local: ${data.path || CUSTOM_SOURCE_PATH}` : "upstream";
    console.log(`\n- ${source} [${tag}] (${data.skills.length})`);
    console.log(`  ${data.skills.join(", ")}`);
  }
  console.log("");
}

function addSkill(source: string, skills: string[], installGlobal: boolean): void {
  console.log(`\nAdding skills from ${source}...`);
  const cliArgs = ["add", source, "-y"];
  if (skills.length > 0) {
    cliArgs.push("-s", ...skills);
  }

  runSkillsCli(cliArgs, { cwd: ROOT_DIR });
  organize();
  listFleet();

  if (installGlobal) {
    installFleet(true, false);
  }
}

function removeSkill(target: string, isSource: boolean, removeGlobal: boolean): void {
  const lock = loadLock();
  const config = loadConfig();
  const normalizedTarget = normalizeSourceKey(target);
  const removedSkills: string[] = [];

  if (isSource) {
    console.log(`Removing source "${normalizedTarget}"...`);
    if (normalizedTarget === CUSTOM_SOURCE_KEY) {
      const customSkills = scanSkillsDirectory(CUSTOM_SKILLS_DIR);
      for (const skill of customSkills.keys()) {
        safeRemove(join(CUSTOM_SKILLS_DIR, skill));
        removedSkills.push(skill);
      }
    } else {
      for (const [skillName, entry] of Object.entries(lock.skills)) {
        if (normalizeSourceKey(entry.source) === normalizedTarget) {
          delete lock.skills[skillName];
          removedSkills.push(skillName);
        }
      }
    }

    if (removedSkills.length === 0 && !config.sources[normalizedTarget]) {
      console.error(`Source "${normalizedTarget}" was not found in fleet.`);
      process.exit(1);
    }
  } else {
    console.log(`Removing skill "${target}"...`);
    let found = false;

    if (lock.skills[target]) {
      delete lock.skills[target];
      found = true;
    }

    const customSkillDir = join(CUSTOM_SKILLS_DIR, target);
    if (existsSync(customSkillDir)) {
      safeRemove(customSkillDir);
      found = true;
    }

    if (!found && !config.skills[target]) {
      console.error(`Skill "${target}" was not found in fleet.`);
      process.exit(1);
    }

    removedSkills.push(target);
  }

  saveLock(lock);
  organize();
  listFleet();

  if (removeGlobal && removedSkills.length > 0) {
    console.log(`Removing ${removedSkills.join(", ")} from global installation...`);
    runSkillsCli(["remove", ...removedSkills, "-g", "-y"], { allowFailure: true });
    for (const skill of removedSkills) {
      safeRemove(join(getGlobalSkillsDir(), skill));
    }
    const statePath = getFleetStatePath();
    const state = readJsonSafe<FleetMachineState>(statePath);
    if (state) {
      state.installedSkills = state.installedSkills.filter((s) => !removedSkills.includes(s));
      state.updatedAt = new Date().toISOString();
      writeJsonPretty(statePath, state);
    }
  }
}

function readInstalledGlobalDirs(): Set<string> {
  const dir = getGlobalSkillsDir();
  const result = new Set<string>();
  if (!existsSync(dir)) return result;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
    if (existsSync(join(dir, ent.name, "SKILL.md"))) {
      result.add(ent.name);
    }
  }
  return result;
}

function readCustomSkillHashes(config: FleetConfig): Record<string, string> {
  const hashes: Record<string, string> = {};
  const customSkills = config.sources[CUSTOM_SOURCE_KEY]?.skills || [];
  for (const skill of customSkills) {
    hashes[skill] = computeDirectoryHash(join(CUSTOM_SKILLS_DIR, skill));
  }
  return hashes;
}

function installFleet(isGlobal: boolean, force = false): void {
  const config = organize({ keepStaging: !isGlobal });
  const lock = loadLock();

  if (Object.keys(config.skills).length === 0) {
    console.log("No skills registered in this fleet to install.");
    return;
  }

  if (!isGlobal) {
    console.log("\nRestoring fleet skills into project (.agents/skills)...");
    if (Object.keys(lock.skills).length > 0) {
      const args = ["experimental_install"];
      if (force) args.push("--force");
      runSkillsCli(args, { cwd: ROOT_DIR });
    }
    const customSkills = config.sources[CUSTOM_SOURCE_KEY]?.skills || [];
    if (customSkills.length > 0 && existsSync(CUSTOM_SKILLS_DIR)) {
      runSkillsCli(["add", CUSTOM_SKILLS_DIR, "-s", ...customSkills, "-y"], { cwd: ROOT_DIR });
    }
    cleanDummyHarnesses();
    console.log("\nProject installation complete.");
    return;
  }

  const globalLock = readJsonSafe<GlobalSkillLock>(getGlobalLockPath());
  const installedGlobalDirs = readInstalledGlobalDirs();
  const machineState = readJsonSafe<FleetMachineState>(getFleetStatePath());
  const customSkillHashes = readCustomSkillHashes(config);

  const plan = computeGlobalSyncPlan({
    config,
    lock,
    globalLock,
    installedGlobalDirs,
    machineState,
    customSkillHashes,
    repoRoot: ROOT_DIR,
    force,
  });

  console.log(
    `\nSyncing global skills (${Object.keys(config.skills).length} managed, ${plan.upToDateCount} already up to date)...`,
  );

  if (plan.toRemove.length > 0) {
    console.log(`\nPruning ${plan.toRemove.length} removed fleet skill(s): ${plan.toRemove.join(", ")}`);
    runSkillsCli(["remove", ...plan.toRemove, "-g", "-y"], { allowFailure: true });
    for (const skill of plan.toRemove) {
      safeRemove(join(getGlobalSkillsDir(), skill));
    }
  }

  for (const batch of plan.upstreamBatches) {
    const sourceSpec = batch.commit ? `${batch.source}#${batch.commit}` : batch.source;
    console.log(`\nInstalling ${batch.skills.length} skill(s) from ${sourceSpec}...`);
    runSkillsCli(["add", sourceSpec, "-s", ...batch.skills, "-g", "-y"], { cwd: ROOT_DIR });
  }

  if (plan.customSkills.length > 0 && existsSync(CUSTOM_SKILLS_DIR)) {
    console.log(`\nInstalling ${plan.customSkills.length} custom skill(s)...`);
    runSkillsCli(["add", CUSTOM_SKILLS_DIR, "-s", ...plan.customSkills, "-g", "-y"], {
      cwd: ROOT_DIR,
    });
  }

  const nextState: FleetMachineState = {
    version: 1,
    installedSkills: Object.keys(config.skills).sort((a, b) => a.localeCompare(b)),
    customHashes: customSkillHashes,
    updatedAt: new Date().toISOString(),
  };
  writeJsonPretty(getFleetStatePath(), nextState);
  cleanDummyHarnesses();

  console.log("\nGlobal fleet sync complete!");
}

function uninstallFleet(isGlobal: boolean, wipeAll = false): void {
  if (!isGlobal) {
    console.log("\nCleaning local project staging and dummy harnesses...");
    cleanLocalStaging();
    console.log("Project cleanup complete.");
    return;
  }

  if (wipeAll) {
    console.log("\nRemoving ALL lock-tracked skills from this machine globally...");
    runSkillsCli(["remove", "-g", "--all"], { allowFailure: true });
    safeRemove(getFleetStatePath());
    cleanDummyHarnesses();
    console.log("Machine wipe complete.");
    return;
  }

  const config = loadConfig();
  const machineState = readJsonSafe<FleetMachineState>(getFleetStatePath());
  const globalLock = readJsonSafe<GlobalSkillLock>(getGlobalLockPath());

  const targets = new Set<string>([
    ...Object.keys(config.skills),
    ...(machineState?.installedSkills || []),
  ]);

  if (globalLock?.skills) {
    for (const [skillName, entry] of Object.entries(globalLock.skills)) {
      if (isFleetLocalSource(entry.source, ROOT_DIR) || isFleetLocalSource(entry.sourceUrl, ROOT_DIR)) {
        targets.add(skillName);
      }
    }
  }

  const skillList = [...targets].sort((a, b) => a.localeCompare(b));
  if (skillList.length === 0) {
    console.log("No fleet-managed skills found on this machine.");
    return;
  }

  console.log(`\nRemoving ${skillList.length} fleet skill(s) globally...`);
  runSkillsCli(["remove", ...skillList, "-g", "-y"], { allowFailure: true });

  const globalSkillsDir = getGlobalSkillsDir();
  for (const skill of skillList) {
    safeRemove(join(globalSkillsDir, skill));
  }

  safeRemove(getFleetStatePath());
  cleanDummyHarnesses();
  console.log("Global fleet cleanup complete.");
}

function updateUpstream(skills: string[]): void {
  console.log("\nChecking upstream sources for skill updates...");
  const lock = loadLock();
  if (Object.keys(lock.skills).length === 0) {
    console.log("No upstream skills in skills-lock.json.");
    organize();
    return;
  }

  const args = ["update", "-p", "-y", ...skills];
  runSkillsCli(args, { cwd: ROOT_DIR });
  organize();
  cleanDummyHarnesses();
  listFleet();
}

function checkStatus(): void {
  const config = loadConfig();
  const lock = loadLock();
  const globalLock = readJsonSafe<GlobalSkillLock>(getGlobalLockPath());
  const installedGlobalDirs = readInstalledGlobalDirs();
  const machineState = readJsonSafe<FleetMachineState>(getFleetStatePath());
  const customSkillHashes = readCustomSkillHashes(config);

  const plan = computeGlobalSyncPlan({
    config,
    lock,
    globalLock,
    installedGlobalDirs,
    machineState,
    customSkillHashes,
    repoRoot: ROOT_DIR,
  });

  const pendingInstalls = plan.upstreamBatches.reduce((sum, b) => sum + b.skills.length, 0);
  console.log(`\nFleet status on ${process.platform}:`);
  console.log(`  Managed skills:    ${Object.keys(config.skills).length}`);
  console.log(`  Up to date:        ${plan.upToDateCount}`);
  console.log(`  Needs install:     ${pendingInstalls} upstream, ${plan.customSkills.length} custom`);
  console.log(`  Needs pruning:     ${plan.toRemove.length}`);
  if (plan.toRemove.length > 0) {
    console.log(`  Prune list:        ${plan.toRemove.join(", ")}`);
  }
  console.log("");
}

function syncFleet(args: string[]): void {
  const shouldUpdate = args.includes("--update");
  const noPush = args.includes("--no-push");
  const force = args.includes("--force");
  const msgParts = args.filter((a) => !a.startsWith("--"));
  const commitMessage =
    msgParts.join(" ").trim() ||
    "chore(fleet): sync fleet registry and global installation";

  console.log("\nSyncing skills-fleet...");

  const hasUpstream =
    runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
      cwd: ROOT_DIR,
      capture: true,
      allowFailure: true,
    }).status === 0;

  if (hasUpstream) {
    console.log("\n1. Pulling latest changes from git remote...");
    runGit(["pull", "--rebase", "--autostash"], { cwd: ROOT_DIR });
  } else {
    console.log("\n1. No upstream git tracking branch configured; skipping pull.");
  }

  if (shouldUpdate) {
    console.log("\n2. Updating upstream skills...");
    updateUpstream([]);
  } else {
    console.log("\n2. Organizing fleet registry...");
    organize();
  }

  console.log("\n3. Reconciling global machine installation...");
  installFleet(true, force);

  console.log("\n4. Checking git working tree...");
  const statusRes = runGit(["status", "--porcelain"], { cwd: ROOT_DIR, capture: true });
  const hasChanges = statusRes.stdout.trim().length > 0;

  if (hasChanges && !noPush) {
    console.log("Committing and pushing fleet changes:");
    console.log(statusRes.stdout.trimEnd());
    runGit(["add", "-A"], { cwd: ROOT_DIR });
    runGit(["commit", "-m", commitMessage], { cwd: ROOT_DIR });
    if (hasUpstream) {
      runGit(["push"], { cwd: ROOT_DIR });
      console.log("\nSynced and pushed to git remote.");
    } else {
      console.log("\nCommitted locally (no remote tracking branch to push).");
    }
  } else if (hasChanges) {
    console.log("Local changes present (--no-push set; skipping commit/push).");
  } else {
    console.log("Repository is clean and global machine is in sync.");
  }
}

function printHelp(): void {
  console.log(`
skills-fleet CLI

Commands:
  list                                   List managed skills grouped by source
  status                                 Compare repo fleet vs local machine global skills
  organize                               Rebuild skills-fleet.config.json and CATALOG.md
  add <source> [skills...] [--global]    Add skills from a source to the fleet
  remove <target> [--source] [--global]  Remove a skill or source from the fleet
  install [--global] [--force]           Install fleet globally (-g) or into project
  clean [--global] [--all]               Uninstall fleet-managed skills cleanly
  clean-harnesses                        Remove empty dummy agent harness directories
  update [skills...]                     Check upstream repositories and update lockfile
  sync [commit-msg] [--update] [--no-push] [--force]
                                         Pull git, apply global sync & prune, and push if changed
`);
}

function main(): void {
  const command = process.argv[2] || "list";
  const args = process.argv.slice(3);

  switch (command) {
    case "list":
      listFleet();
      break;

    case "status":
      checkStatus();
      break;

    case "organize":
      organize();
      break;

    case "add": {
      const isGlobal = args.includes("-g") || args.includes("--global");
      const positional = args.filter((a) => a !== "-g" && a !== "--global");
      const source = positional[0];
      if (!source) {
        console.error("Usage: bun run fleet:add <source> [skills...] [--global]");
        process.exit(1);
      }
      addSkill(source, positional.slice(1), isGlobal);
      break;
    }

    case "remove":
    case "rm": {
      const isSource = args.includes("--source");
      const isGlobal = args.includes("-g") || args.includes("--global");
      const positional = args.filter(
        (a) => a !== "--source" && a !== "-g" && a !== "--global",
      );
      const target = positional[0];
      if (!target) {
        console.error("Usage: bun run fleet:remove <skill-name|source> [--source] [--global]");
        process.exit(1);
      }
      removeSkill(target, isSource, isGlobal);
      break;
    }

    case "install": {
      const isGlobal = args.includes("-g") || args.includes("--global");
      const force = args.includes("--force");
      installFleet(isGlobal, force);
      break;
    }

    case "uninstall":
    case "clean": {
      const isGlobal =
        args.includes("-g") || args.includes("--global") || args.includes("--machine");
      const wipeAll = args.includes("--all");
      uninstallFleet(isGlobal, wipeAll);
      break;
    }

    case "clean-harnesses":
    case "purge-harnesses":
      cleanDummyHarnesses();
      break;

    case "update": {
      const skills = args.filter((a) => !a.startsWith("-"));
      updateUpstream(skills);
      break;
    }

    case "sync":
    case "sync-push":
    case "sync:push":
      syncFleet(args);
      break;

    case "--help":
    case "-h":
    case "help":
      printHelp();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
