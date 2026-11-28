import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

interface SkillLockEntry {
  source: string;
  commit?: string;
  sourceType?: string;
  skillPath?: string;
  computedHash?: string;
}

interface SkillsLock {
  version: number;
  skills: Record<string, SkillLockEntry>;
}

interface SkillMeta {
  name: string;
  description?: string;
  argumentHint?: string;
}

interface SourceGroup {
  source: string;
  path: string;
  skills: SkillMeta[];
}

interface FleetConfig {
  name: string;
  version: string;
  description: string;
  sources: Record<string, { skills: string[]; path: string }>;
}

const ROOT_DIR = process.cwd();
const CONFIG_PATH = resolve(ROOT_DIR, "skills-fleet.config.json");
const LOCK_PATH = resolve(ROOT_DIR, "skills-lock.json");
const AGENTS_SKILLS_DIR = resolve(ROOT_DIR, ".agents", "skills");
const SKILLS_DIR = resolve(ROOT_DIR, "skills");
const CATALOG_PATH = resolve(ROOT_DIR, "CATALOG.md");

function parseSkillFrontmatter(skillMdPath: string): SkillMeta {
  const fallback = { name: dirname(skillMdPath).split("/").pop() || "unknown" };
  if (!existsSync(skillMdPath)) return fallback;

  try {
    const content = readFileSync(skillMdPath, "utf-8");
    if (!content.startsWith("---")) return fallback;

    const endIdx = content.indexOf("\n---", 3);
    if (endIdx === -1) return fallback;

    const frontmatter = content.slice(3, endIdx).trim();
    const lines = frontmatter.split("\n");
    let name = fallback.name;
    let description = "";
    let argumentHint = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("name:")) {
        name = trimmed.replace(/^name:\s*/, "").replace(/^["']|["']$/g, "");
      } else if (trimmed.startsWith("description:")) {
        description = trimmed.replace(/^description:\s*/, "").replace(/^["']|["']$/g, "");
      } else if (trimmed.startsWith("argument-hint:")) {
        argumentHint = trimmed.replace(/^argument-hint:\s*/, "").replace(/^["']|["']$/g, "");
      }
    }

    return { name, description, argumentHint };
  } catch {
    return fallback;
  }
}

function loadLock(): SkillsLock | null {
  if (!existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(readFileSync(LOCK_PATH, "utf-8")) as SkillsLock;
  } catch {
    return null;
  }
}

function loadConfig(): FleetConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {
      name: "skills-fleet",
      version: "1.0.0",
      description: "Central catalog for managed AI agent skills",
      sources: {},
    };
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return {
      name: raw.name || "skills-fleet",
      version: raw.version || "1.0.0",
      description: raw.description || "Central catalog for managed AI agent skills",
      sources: raw.sources || {},
    };
  } catch {
    return {
      name: "skills-fleet",
      version: "1.0.0",
      description: "Central catalog for managed AI agent skills",
      sources: {},
    };
  }
}

function saveConfig(config: FleetConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function organize(): void {
  const lock = loadLock();
  mkdirSync(SKILLS_DIR, { recursive: true });

  // Clean up any agent mirror folders that bunx skills may create locally
  for (const dummy of ["agent", ".claude", ".crush", ".devin", ".goose", ".kimchi", ".openclaw"]) {
    const dummyPath = join(ROOT_DIR, dummy);
    if (existsSync(dummyPath)) {
      spawnSync("rm", ["-rf", dummyPath]);
    }
  }

  // Clean up any direct symlinks in skills/ created by bunx skills agent detectors
  if (existsSync(SKILLS_DIR)) {
    for (const file of readdirSync(SKILLS_DIR)) {
      const p = join(SKILLS_DIR, file);
      if (lstatSync(p).isSymbolicLink()) {
        unlinkSync(p);
      }
    }
  }

  const grouped: Record<string, SourceGroup> = {};

  if (lock && lock.skills) {
    for (const [skillName, entry] of Object.entries(lock.skills)) {
      const source = entry.source || "local";
      const sourceRelPath = join("skills", ...source.split("/"));
      const sourceAbsDir = resolve(ROOT_DIR, sourceRelPath);
      const skillTargetAbsDir = join(sourceAbsDir, skillName);

      if (!grouped[source]) {
        grouped[source] = {
          source,
          path: sourceRelPath,
          skills: [],
        };
      }

      mkdirSync(sourceAbsDir, { recursive: true });

      const agentSkillDir = join(AGENTS_SKILLS_DIR, skillName);
      if (existsSync(agentSkillDir)) {
        const stat = lstatSync(agentSkillDir);
        if (stat.isSymbolicLink()) {
          // Already symlinked
        } else if (stat.isDirectory()) {
          if (existsSync(skillTargetAbsDir)) {
            spawnSync("rm", ["-rf", skillTargetAbsDir]);
          }
          renameSync(agentSkillDir, skillTargetAbsDir);
          const relTarget = relative(AGENTS_SKILLS_DIR, skillTargetAbsDir);
          symlinkSync(relTarget, agentSkillDir);
        }
      } else {
        mkdirSync(AGENTS_SKILLS_DIR, { recursive: true });
        if (existsSync(skillTargetAbsDir)) {
          const relTarget = relative(AGENTS_SKILLS_DIR, skillTargetAbsDir);
          symlinkSync(relTarget, agentSkillDir);
        }
      }

      const skillMd = join(skillTargetAbsDir, "SKILL.md");
      const meta = parseSkillFrontmatter(skillMd);
      meta.name = skillName;
      grouped[source].skills.push(meta);
    }
  }

  // Also scan filesystem skills/ for any manually added sources
  if (existsSync(SKILLS_DIR)) {
    function walkDirs(currentDir: string, depth = 0): void {
      if (depth > 3) return;
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const sub = join(currentDir, ent.name);
        const skillMd = join(sub, "SKILL.md");
        if (existsSync(skillMd)) {
          const relToSkills = relative(SKILLS_DIR, dirname(sub));
          const source = relToSkills || "custom";
          if (!grouped[source]) {
            grouped[source] = {
              source,
              path: relative(ROOT_DIR, dirname(sub)),
              skills: [],
            };
          }
          if (!grouped[source].skills.some((s) => s.name === ent.name)) {
            const meta = parseSkillFrontmatter(skillMd);
            meta.name = ent.name;
            grouped[source].skills.push(meta);

            const agentSkillDir = join(AGENTS_SKILLS_DIR, ent.name);
            if (!existsSync(agentSkillDir)) {
              mkdirSync(AGENTS_SKILLS_DIR, { recursive: true });
              const relTarget = relative(AGENTS_SKILLS_DIR, sub);
              symlinkSync(relTarget, agentSkillDir);
            }
          }
        } else {
          walkDirs(sub, depth + 1);
        }
      }
    }
    walkDirs(SKILLS_DIR);
  }

  // Update skills-fleet.config.json
  const config = loadConfig();
  config.sources = {};
  for (const [source, group] of Object.entries(grouped)) {
    config.sources[source] = {
      skills: group.skills.map((s) => s.name).sort(),
      path: group.path,
    };
  }
  saveConfig(config);

  // Generate CATALOG.md
  generateCatalog(grouped);

  console.log(`Organized ${Object.keys(grouped).length} source(s) into skills/ grouped structure.`);
}

function generateCatalog(grouped: Record<string, SourceGroup>): void {
  const lines: string[] = [
    "# Skills Fleet Catalog",
    "",
    "> Managed AI agent skills grouped by source repository.",
    "",
  ];

  const sourceKeys = Object.keys(grouped).sort();
  if (sourceKeys.length === 0) {
    lines.push("No skills are currently registered in this fleet.", "");
    lines.push("Add skills using:", "```bash", "bun run fleet:add <source> [skills...]", "```");
  } else {
    for (const src of sourceKeys) {
      const g = grouped[src];
      lines.push(`## ${src}`);
      lines.push(`- **Location**: \`${g.path}/\``);
      lines.push(`- **Total Skills**: ${g.skills.length}`);
      lines.push("");
      lines.push("| Skill | Description | Argument Hint |");
      lines.push("| --- | --- | --- |");

      const sortedSkills = g.skills.slice().sort((a, b) => a.name.localeCompare(b.name));
      for (const sk of sortedSkills) {
        const desc = (sk.description || "—").replace(/\|/g, "\\|").slice(0, 100);
        const arg = (sk.argumentHint || "—").replace(/\|/g, "\\|");
        lines.push(`| [${sk.name}](./${g.path}/${sk.name}/SKILL.md) | ${desc} | \`${arg}\` |`);
      }
      lines.push("");
    }
  }

  writeFileSync(CATALOG_PATH, lines.join("\n") + "\n", "utf-8");
}

function listFleet(): void {
  const config = loadConfig();
  console.log(`\nSkills Fleet: ${config.name} (v${config.version})`);
  console.log(`${config.description}\n`);

  const sources = Object.entries(config.sources || {});
  if (sources.length === 0) {
    console.log("No skills registered in this fleet yet.");
    console.log("To add skills grouped by source, run:");
    console.log("  bun run fleet:add <source> [skills...]\n");
    return;
  }

  console.log(`Skills Grouped by Source (${sources.length} sources):`);
  for (const [source, data] of sources) {
    console.log(`\n📦 ${source} (at ${data.path})`);
    console.log(`   Skills (${data.skills.length}): ${data.skills.join(", ")}`);
  }
  console.log("");
}

function addSkill(source: string, skills: string[]): void {
  console.log(`\nFetching & adding skills from source: ${source}...`);

  const args = ["skills", "add", source, "-y"];
  if (skills.length > 0) {
    args.push("-s", ...skills);
  }

  console.log(`Executing: bunx ${args.join(" ")}`);
  const result = spawnSync("bunx", args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`Error adding skill from ${source}`);
    process.exit(result.status || 1);
  }

  console.log("\nGrouping newly added skills by source...");
  organize();
  listFleet();
}

function removeSkill(target: string, isSource = false): void {
  const config = loadConfig();
  const lock = loadLock();

  if (isSource) {
    console.log(`Removing entire source: ${target}...`);
    const sourceData = config.sources[target];
    if (!sourceData) {
      console.error(`Source "${target}" not found in fleet.`);
      return;
    }

    const sourceDir = resolve(ROOT_DIR, sourceData.path);
    if (existsSync(sourceDir)) {
      spawnSync("rm", ["-rf", sourceDir]);
    }

    for (const skill of sourceData.skills) {
      const agentLink = join(AGENTS_SKILLS_DIR, skill);
      if (existsSync(agentLink)) {
        try { unlinkSync(agentLink); } catch {}
      }
      if (lock && lock.skills && lock.skills[skill]) {
        delete lock.skills[skill];
      }
    }

    if (lock) {
      writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + "\n", "utf-8");
    }

    delete config.sources[target];
    saveConfig(config);
    organize();
    listFleet();
    return;
  }

  console.log(`Removing skill: ${target}...`);
  let found = false;

  for (const [source, data] of Object.entries(config.sources)) {
    if (data.skills.includes(target)) {
      found = true;
      const skillDir = resolve(ROOT_DIR, data.path, target);
      if (existsSync(skillDir)) {
        spawnSync("rm", ["-rf", skillDir]);
      }
      data.skills = data.skills.filter((s) => s !== target);
      if (data.skills.length === 0) {
        delete config.sources[source];
        const sourceDir = resolve(ROOT_DIR, data.path);
        try { spawnSync("rmdir", [sourceDir]); } catch {}
      }
    }
  }

  const agentLink = join(AGENTS_SKILLS_DIR, target);
  if (existsSync(agentLink)) {
    try { unlinkSync(agentLink); } catch {}
  }

  if (lock && lock.skills && lock.skills[target]) {
    delete lock.skills[target];
    writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2) + "\n", "utf-8");
  }

  if (!found) {
    console.log(`Skill "${target}" was not found in fleet config, cleaning anyway...`);
  }

  saveConfig(config);
  organize();
  listFleet();
}

function uninstallFleet(isGlobal: boolean, wipeAll = false): void {
  if (wipeAll && isGlobal) {
    console.log("\n🧹 Removing ALL skills from this machine globally...");
    spawnSync("bunx", ["skills", "remove", "-g", "--all"], { stdio: "inherit" });
    console.log("\n✨ Machine cleanup complete! No skills remain.");
    return;
  }

  const config = loadConfig();
  const sources = Object.entries(config.sources || {});

  const allSkills = new Set<string>();
  for (const [, data] of sources) {
    for (const skill of data.skills) {
      allSkills.add(skill);
    }
  }

  if (allSkills.size === 0) {
    console.log("No skills registered in this fleet to clean up.");
    return;
  }

  const skillList = Array.from(allSkills);
  console.log(`\n🧹 Cleaning up ${skillList.length} fleet skill(s) from ${isGlobal ? "this machine (global scope)" : "this project"}...`);
  console.log(`Skills: ${skillList.join(", ")}\n`);

  const args = ["skills", "remove", ...skillList, "-y"];
  if (isGlobal) args.push("-g");

  console.log(`Executing: bunx ${args.join(" ")}`);
  spawnSync("bunx", args, { stdio: "inherit" });

  const targetDir = isGlobal
    ? resolve(process.env.HOME || "~", ".agents", "skills")
    : AGENTS_SKILLS_DIR;

  if (existsSync(targetDir)) {
    for (const skill of skillList) {
      const p = join(targetDir, skill);
      if (existsSync(p)) {
        try {
          unlinkSync(p);
        } catch {
          spawnSync("rm", ["-rf", p]);
        }
      }
    }
  }

  console.log(`\n✨ Fleet cleanup complete for ${isGlobal ? "this machine" : "this project"}!`);
}

function installFleet(isGlobal: boolean): void {
  const config = loadConfig();
  const sources = Object.entries(config.sources || {});

  if (sources.length === 0) {
    console.log("No skills registered in this fleet to install.");
    return;
  }

  console.log(`Installing fleet skills (${isGlobal ? "global" : "project"} scope)...`);

  for (const [source, data] of sources) {
    for (const skill of data.skills) {
      const skillPath = resolve(ROOT_DIR, data.path, skill);
      if (existsSync(skillPath)) {
        const args = ["skills", "add", skillPath, "-y"];
        if (isGlobal) args.push("-g");

        console.log(`\nExecuting: bunx ${args.join(" ")}`);
        spawnSync("bunx", args, { stdio: "inherit" });
      } else {
        const args = ["skills", "add", source, "-s", skill, "-y"];
        if (isGlobal) args.push("-g");

        console.log(`\nExecuting: bunx ${args.join(" ")}`);
        spawnSync("bunx", args, { stdio: "inherit" });
      }
    }
  }
}

function cleanDummyHarnesses(): void {
  console.log("\n🧹 Scanning for dummy agent harness folders...");

  const home = process.env.HOME || "~";
  const knownHarnessDirs = [
    ".adal", ".aider-desk", ".astrbot", ".augment", ".autohand", ".bob", ".claude",
    ".codeartsdoer", ".codebuddy", ".codeium", ".codemaker", ".codestudio", ".commandcode",
    ".continue", ".forge", ".grok", ".hermes", ".iflow", ".inferencesh", ".jazz", ".junie",
    ".kiro", ".kode", ".lingma", ".mcpjam", ".minimax", ".moxby", ".mux", ".neovate",
    ".ona", ".openclaw", ".openhands", ".pochi", ".posit", ".qoder", ".qoder-cn", ".qwen",
    ".reasonix", ".roo", ".rovodev", ".snowflake", ".tabnine", ".terramind", ".tinycloud",
    ".trae", ".trae-cn", ".vibe", ".zcode", ".zencoder"
  ];

  const removed: string[] = [];

  for (const name of knownHarnessDirs) {
    const p = join(home, name);
    if (!existsSync(p)) continue;

    try {
      const entries = readdirSync(p);
      const isDummyOnly =
        entries.length === 0 ||
        (entries.length === 1 &&
          ["skills", "data", "assistant", "windsurf", "cortex", "agent"].includes(entries[0]));

      if (isDummyOnly) {
        spawnSync("rm", ["-rf", p]);
        removed.push(`~/${name}`);
      } else {
        console.log(`⚠️  Skipped ~/${name} (contains other non-skill files)`);
      }
    } catch {}
  }

  const localDummies = ["agent", ".claude", ".crush", ".devin", ".goose", ".kimchi", ".openclaw"];
  for (const name of localDummies) {
    const p = join(ROOT_DIR, name);
    if (existsSync(p)) {
      try {
        const entries = readdirSync(p);
        if (entries.length === 0 || (entries.length === 1 && entries[0] === "skills")) {
          spawnSync("rm", ["-rf", p]);
          removed.push(`./${name}`);
        }
      } catch {}
    }
  }

  if (removed.length === 0) {
    console.log("✨ No dummy harness folders found. Your environment is clean!\n");
  } else {
    console.log(`✨ Removed ${removed.length} dummy harness folder(s):`);
    for (const item of removed) {
      console.log(`   - ${item}`);
    }
    console.log("");
  }
}

function syncAndPush(commitMessage?: string): void {
  console.log("\n🚀 Running full fleet update, global sync, and git push...\n");

  console.log("📥 Step 1/5: Pulling latest changes from git remote...");
  const pullRes = spawnSync("git", ["pull", "--rebase"], { stdio: "inherit" });
  if (pullRes.status !== 0) {
    console.warn("⚠️  Git pull failed or had conflicts, continuing with sync...");
  }

  console.log("\n🔄 Step 2/5: Checking for upstream skill updates...");
  spawnSync("bunx", ["skills", "update", "-y"], { stdio: "inherit" });

  console.log("\n📦 Step 3/5: Restoring updated skills from lockfile...");
  spawnSync("bunx", ["skills", "experimental_install"], { stdio: "inherit" });

  console.log("\n🧹 Step 4/5: Organizing fleet and syncing globally...");
  organize();
  cleanDummyHarnesses();
  installFleet(true);
  cleanDummyHarnesses();

  console.log("\n📤 Step 5/5: Checking for changes and pushing to remote...");
  const statusResult = spawnSync("git", ["status", "--porcelain"], { encoding: "utf-8" });
  const hasChanges = Boolean(statusResult.stdout && statusResult.stdout.trim().length > 0);

  if (hasChanges) {
    console.log("Found changes to commit:");
    console.log(statusResult.stdout);
    spawnSync("git", ["add", "."], { stdio: "inherit" });
    const msg = commitMessage || "chore(fleet): sync skills from upstream and update global installation";
    const commitRes = spawnSync("git", ["commit", "-m", msg], { stdio: "inherit" });
    if (commitRes.status === 0) {
      const pushRes = spawnSync("git", ["push"], { stdio: "inherit" });
      if (pushRes.status === 0) {
        console.log("\n✅ Successfully pushed updates to git remote!");
      } else {
        console.error("\n❌ Failed to push to remote.");
      }
    }
  } else {
    console.log("\n✅ Fleet is already clean and in sync. Nothing to commit.");
  }

  console.log("\n✨ Fleet update, sync, and push complete!\n");
}

function main(): void {
  const command = process.argv[2] || "list";
  const args = process.argv.slice(3);

  switch (command) {
    case "list":
      listFleet();
      break;

    case "organize":
      organize();
      break;

    case "add": {
      const source = args[0];
      if (!source) {
        console.error("Usage: bun run fleet:add <source> [skills...]");
        process.exit(1);
      }
      addSkill(source, args.slice(1));
      break;
    }

    case "remove":
    case "rm": {
      const target = args[0];
      if (!target) {
        console.error("Usage: bun run fleet:remove <skill-name> [--source]");
        process.exit(1);
      }
      const isSource = args.includes("--source");
      removeSkill(target, isSource);
      break;
    }

    case "install": {
      const isGlobal = args.includes("-g") || args.includes("--global");
      installFleet(isGlobal);
      break;
    }

    case "uninstall":
    case "clean": {
      const isGlobal = args.includes("-g") || args.includes("--global") || args.includes("--machine");
      const wipeAll = args.includes("--all");
      uninstallFleet(isGlobal, wipeAll);
      break;
    }

    case "clean-harnesses":
    case "purge-harnesses":
      cleanDummyHarnesses();
      break;

    case "update": {
      console.log("\nChecking for skill updates from upstream sources...");
      const result = spawnSync("bunx", ["skills", "update", "-y"], { stdio: "inherit" });
      if (result.status !== 0) {
        console.error("Error updating skills.");
      }
      spawnSync("bunx", ["skills", "experimental_install"], { stdio: "inherit" });
      organize();
      cleanDummyHarnesses();
      listFleet();
      break;
    }

    case "sync":
    case "sync-push":
    case "sync:push": {
      syncAndPush(args.join(" ") || undefined);
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log("Available commands: list, organize, add <source> [skills...], remove <skill> [--source], install [--global], clean [--global] [--all], clean-harnesses, update, sync [commit-message]");
      process.exit(1);
  }
}

main();
