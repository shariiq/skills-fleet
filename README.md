# skills-fleet

A fleet management repository to track, manage, and install AI agent skills across projects, machines, and agents.

Whenever skills are added to this repository, they are **automatically grouped by their source repository** inside `skills/<owner>/<repo>/<skill-name>/`, while relative symlinks are maintained in `.agents/skills/` so agents and tools can use them seamlessly.

## Features

- **Automatic Source Grouping**: When skills are added, they are organized into clean directory trees grouped by their source repository (e.g. `skills/mattpocock/skills/ask-matt/`, `skills/caldoai/skills/prune-tests/`).
- **Declarative Source Registry**: Keeps `skills-fleet.config.json` and `CATALOG.md` up to date with all skills grouped by source.
- **Universal Agent Support**: `.agents/skills/` symlinks are created automatically, enabling Antigravity, Claude Code, Codex, Cursor, and any other supported agent to find and run them.
- **Global & Project Installation**: Easily deploy all registered skills globally (`-g`) or into specific local workspaces.

## Structure

```
skills-fleet/
├── skills/                      # Actual skill files grouped by source
│   ├── <owner>/
│   │   └── <repo>/
│   │       └── <skill-name>/
│   │           └── SKILL.md
├── .agents/skills/              # Agent-facing relative symlinks to skills/
├── skills-fleet.config.json     # Declarative registry grouped by source
├── CATALOG.md                   # Auto-generated Markdown catalog
├── package.json                 # Scripts for fleet management
└── scripts/
    └── fleet.ts                 # Organizer, installer, and add CLI
```

## Adding Skills to the Fleet (Grouped by Source)

To add skills to this repository and have them automatically grouped by their source:

```bash
bun run fleet:add <source> [skills...]
```

### Examples:
```bash
# Add specific skills from a repo
bun run fleet:add mattpocock/skills ask-matt code-review

# Add all skills from a repo
bun run fleet:add caldoai/skills
```

What happens under the hood:
1. `bunx skills add` downloads and registers the skills.
2. `organize` moves each skill into `skills/<source>/<skill-name>/`.
3. Creates a relative symlink from `.agents/skills/<skill-name>` pointing to `../../skills/<source>/<skill-name>`.
4. Updates `skills-fleet.config.json` with the new source group.
5. Regenerates `CATALOG.md`.

## Other Commands

### View Managed Skills Grouped by Source
```bash
bun run fleet:list
```

### Re-organize / Group Existing Skills
If you manually copied skills or ran `bunx skills add` directly:
```bash
bun run fleet:organize
```

### Install All Skills to System / Workspace
- **Globally** (across all agents on your system):
  ```bash
  bun run fleet:install:global
  ```

- **Project-Level**:
  ```bash
  bun run fleet:install:project
  ```

### Clean Up / Uninstall from Machine
To completely uninstall **everything this fleet added to your machine**:
```bash
bun run fleet:clean:machine
```
*(Removes all fleet skills from all agent configurations on your machine).*

To purge all **dummy agent harness folders** created in `~` or the project (e.g. `.bob`, `.terramind`, `.qwen`, `.adal`, `.claude`):
```bash
bun run fleet:clean:harnesses
```

To completely wipe **all skills** across the machine:
```bash
bun run fleet:wipe:machine
```

### Remove a Skill from the Fleet
To delete a skill from the repository catalog and disk:
```bash
# Remove a single skill
bun run fleet:remove <skill-name>

# Remove an entire source repo
bun run fleet:remove <source> --source
```
