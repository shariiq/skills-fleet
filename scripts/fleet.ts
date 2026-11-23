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
            // Target already exists, remove temporary folder
            spawnSync("rm", ["-rf", agentSkillDir]);
          } else {
            renameSync(agentSkillDir, skillTargetAbsDir);
          }
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

  const args = ["skills", "add", source, "-y", "--agent", "*"];
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

function installFleet(isGlobal: boolean): void {
  const config = loadConfig();
  const sources = Object.entries(config.sources || {});

  if (sources.length === 0) {
    console.log("No skills registered in this fleet to install.");
    return;
  }

  console.log(`Installing fleet skills (${isGlobal ? "global" : "project"} scope)...`);

  for (const [source, data] of sources) {
    const isRemoteRepo = source.includes("/") && !source.startsWith("custom") && !source.startsWith("local");

    if (!isRemoteRepo && existsSync(resolve(ROOT_DIR, data.path))) {
      for (const skill of data.skills) {
        const skillPath = resolve(ROOT_DIR, data.path, skill);
        const args = ["skills", "add", skillPath, "-y", "--agent", "*"];
        if (isGlobal) args.push("-g");

        console.log(`\nExecuting: bunx ${args.join(" ")}`);
        spawnSync("bunx", args, { stdio: "inherit" });
      }
    } else {
      const args = ["skills", "add", source, "-y", "--agent", "*"];
      if (isGlobal) args.push("-g");
      if (data.skills && data.skills.length > 0) {
        args.push("-s", ...data.skills);
      }

      console.log(`\nExecuting: bunx ${args.join(" ")}`);
      spawnSync("bunx", args, { stdio: "inherit" });
    }
  }
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

    case "install": {
      const isGlobal = args.includes("-g") || args.includes("--global");
      installFleet(isGlobal);
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log("Available commands: list, organize, add <source> [skills...], install [--global]");
      process.exit(1);
  }
}

main();
