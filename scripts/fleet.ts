import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface SkillPackage {
  source: string;
  skills?: string[];
  agents?: string[];
  notes?: string;
}

interface FleetConfig {
  name: string;
  version: string;
  description: string;
  packages: SkillPackage[];
}

const CONFIG_PATH = resolve(process.cwd(), "skills-fleet.config.json");

function loadConfig(): FleetConfig {
  if (!existsSync(CONFIG_PATH)) {
    return {
      name: "skills-fleet",
      version: "1.0.0",
      description: "Central catalog for managed AI agent skills",
      packages: [],
    };
  }
  const content = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(content) as FleetConfig;
}

function saveConfig(config: FleetConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function listFleet(): void {
  const config = loadConfig();
  console.log(`\nSkills Fleet: ${config.name} (v${config.version})`);
  console.log(`${config.description}\n`);

  if (!config.packages || config.packages.length === 0) {
    console.log("No skills registered in skills-fleet.config.json yet.");
    console.log("Add skills using:");
    console.log("  bun run scripts/fleet.ts add <repo> [skills...]");
    return;
  }

  console.log(`Registered Packages (${config.packages.length}):`);
  for (const pkg of config.packages) {
    console.log(`\n• Source: ${pkg.source}`);
    if (pkg.skills && pkg.skills.length > 0) {
      console.log(`  Skills (${pkg.skills.length}): ${pkg.skills.join(", ")}`);
    } else {
      console.log("  Skills: all (*)");
    }
    if (pkg.notes) {
      console.log(`  Notes: ${pkg.notes}`);
    }
  }
  console.log("");
}

function installFleet(isGlobal: boolean): void {
  const config = loadConfig();

  if (!config.packages || config.packages.length === 0) {
    console.log("No skills registered in skills-fleet.config.json to install.");
    return;
  }

  console.log(`Installing fleet skills (${isGlobal ? "global" : "project"} scope)...`);

  for (const pkg of config.packages) {
    const args = ["skills", "add", pkg.source, "-y"];

    if (isGlobal) {
      args.push("-g");
    }

    const agents = pkg.agents && pkg.agents.length > 0 ? pkg.agents.join(" ") : "*";
    args.push("--agent", agents);

    if (pkg.skills && pkg.skills.length > 0) {
      args.push("-s", ...pkg.skills);
    }

    console.log(`\nExecuting: bunx ${args.join(" ")}`);
    const result = spawnSync("bunx", args, { stdio: "inherit" });
    if (result.status !== 0) {
      console.error(`Failed to install from ${pkg.source} (exit code ${result.status})`);
    }
  }
}

function addSkill(source: string, skills: string[]): void {
  const config = loadConfig();
  let existing = config.packages.find((p) => p.source.toLowerCase() === source.toLowerCase());

  if (existing) {
    if (skills.length > 0) {
      existing.skills = Array.from(new Set([...(existing.skills || []), ...skills]));
    }
    console.log(`Updated existing package: ${source}`);
  } else {
    const newPkg: SkillPackage = {
      source,
      skills: skills.length > 0 ? skills : undefined,
    };
    config.packages.push(newPkg);
    console.log(`Added new package: ${source}`);
  }

  saveConfig(config);
  listFleet();
}

function main(): void {
  const command = process.argv[2] || "list";
  const flags = process.argv.slice(3);

  switch (command) {
    case "list":
      listFleet();
      break;

    case "install": {
      const isGlobal = flags.includes("-g") || flags.includes("--global");
      installFleet(isGlobal);
      break;
    }

    case "add": {
      const source = flags[0];
      if (!source) {
        console.error("Usage: bun run scripts/fleet.ts add <repo> [skills...]");
        process.exit(1);
      }
      const skills = flags.slice(1);
      addSkill(source, skills);
      break;
    }

    default:
      console.log(`Unknown command: ${command}`);
      console.log("Available commands: list, install [--global], add <repo> [skills...]");
      process.exit(1);
  }
}

main();
