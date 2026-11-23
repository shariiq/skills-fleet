# skills-fleet

A fleet management repository to track, manage, and install AI agent skills across projects, machines, and agents.

This repository uses [`skills`](https://skills.sh) (`bunx skills`) to manage skill configurations, declarative catalogs, and automated multi-agent installations.

## Features

- **Declarative Skill Catalog**: Define skill sources and specific skill subsets in `skills-fleet.config.json`.
- **Global & Project Installation**: Easily install all registered skills globally (`-g`) or into specific local workspaces.
- **Cross-Agent Support**: Compatible with all `skills.sh`-supported agents including Antigravity CLI, Codex, Claude Code, Gemini CLI, Cursor, and more.
- **Zero Lock-In**: Manage native `bunx skills` commands or custom fleet automation scripts.

## Structure

```
skills-fleet/
├── skills-fleet.config.json    # Declarative manifest of managed skill sources
├── package.json               # NPM/Bun scripts for fleet management
├── scripts/
│   └── fleet.ts               # CLI helper for listing, adding, and installing skills
└── README.md
```

## Usage

### 1. View Managed Skills
List all skills registered in the fleet:
```bash
bun run fleet:list
```

### 2. Install Fleet Skills
Install all skills defined in `skills-fleet.config.json`:

- **Globally** (accessible across all workspaces and agents on your machine):
  ```bash
  bun run fleet:install:global
  ```

- **Project-Level** (local to current directory):
  ```bash
  bun run fleet:install:project
  ```

### 3. Register a New Skill Source
Add a repository or specific skills to the fleet catalog:
```bash
bun run scripts/fleet.ts add <owner/repo> [skill-names...]
```

Example:
```bash
bun run scripts/fleet.ts add mattpocock/skills ask-matt code-review
```

### 4. Direct `skills` CLI Helpers
You can also run standard `bunx skills` commands directly:
```bash
# List globally installed skills
bun run skills:list:global

# Update installed skills to latest versions
bun run skills:update
```

## Adding Skills to this Fleet

Edit `skills-fleet.config.json` directly or use `bun run scripts/fleet.ts add`:

```json
{
  "name": "skills-fleet",
  "version": "1.0.0",
  "description": "Central catalog for managed AI agent skills",
  "packages": [
    {
      "source": "mattpocock/skills",
      "skills": ["ask-matt", "code-review", "tdd"],
      "notes": "Engineering and review skills"
    }
  ]
}
```
