# skills-fleet

A lightweight, cross-platform registry to track, install, and synchronize AI agent skills across machines using [`bunx skills`](https://skills.sh/).

Instead of storing entire upstream repositories or OS-specific `.agents/skills/` symlinks in git, `skills-fleet` keeps only:
- **`skills-lock.json`** — Upstream skill sources, pinned commits, and content hashes.
- **`skills-fleet.config.json`** — Normalized, OS-independent registry grouped by source.
- **`skills/custom/`** — Locally authored custom skills not hosted in an upstream repository.
- **`CATALOG.md`** — Auto-generated Markdown catalog of all managed skills.

## Structure

```text
skills-fleet/
├── skills/
│   └── custom/                 # Custom skills tracked directly in this repo
├── scripts/
│   ├── fleet.ts                # Fleet CLI entrypoint
│   └── lib/                    # Registry, frontmatter, fs, and runner modules
├── skills-fleet.config.json    # Declarative registry grouped by source
├── skills-lock.json            # Pinned upstream skills lockfile
├── CATALOG.md                  # Auto-generated Markdown catalog
└── package.json                # Fleet management npm scripts
```

## Syncing on Any Machine (Windows, macOS, Linux)

Clone the repository and run:

```bash
bun run fleet:install:global
```

Or pull remote changes and reconcile your machine in one command:

```bash
bun run sync
```

What `install --global` / `sync` does:
1. Groups upstream skills by source and pinned commit, skipping skills already up to date on disk.
2. Installs missing or outdated skills in batched `bunx skills add` calls per source repo.
3. Installs custom skills from `skills/custom/`.
4. Prunes any previously fleet-installed skills that were removed from `skills-fleet`.
5. Cleans up empty dummy agent harness directories.

## Commands

### View Status & Managed Skills
```bash
bun run fleet:list
bun run fleet:status
```

### Add Skills from an Upstream Repository
```bash
bun run fleet:add <source> [skills...]
# Example:
bun run fleet:add mattpocock/skills code-review tdd
```
Pass `--global` (`-g`) to also install immediately on the current machine.

### Remove a Skill or Source
```bash
bun run fleet:remove <skill-name>
bun run fleet:remove <source> --source
```
Pass `--global` (`-g`) to also remove from the current machine.

### Update Upstream Skills
```bash
bun run fleet:update
```
Checks upstream repositories for updates to `skills-lock.json`, refreshes metadata in `skills-fleet.config.json`, and regenerates `CATALOG.md`.

### Sync Across Machines
```bash
bun run sync                   # Pull git, reconcile global skills, push if repo changed
bun run fleet:sync -- --update # Also check upstream updates before syncing and pushing
bun run fleet:sync -- --no-push
```

### Clean Up Machine
```bash
bun run fleet:clean:machine    # Remove all fleet-managed skills globally
bun run fleet:clean:harnesses  # Remove empty dummy agent directories
bun run fleet:wipe:machine     # Remove all lock-tracked global skills
```
