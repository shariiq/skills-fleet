import { describe, expect, test } from "bun:test";
import { parseSkillFrontmatter } from "./lib/frontmatter.ts";
import { isFleetLocalSource, normalizeSourceKey, toPosixPath } from "./lib/fs-utils.ts";
import {
  buildFleetConfig,
  computeGlobalSyncPlan,
  generateCatalogMarkdown,
} from "./lib/registry.ts";
import type { FleetConfig, GlobalSkillLock, SkillMetadata, SkillsLock } from "./lib/types.ts";

describe("fs-utils", () => {
  test("normalizes Windows and POSIX paths to forward slashes", () => {
    expect(toPosixPath("skills\\mattpocock\\skills")).toBe("skills/mattpocock/skills");
    expect(normalizeSourceKey("mattpocock\\skills/")).toBe("mattpocock/skills");
  });

  test("identifies legacy local fleet sources without false positives", () => {
    expect(
      isFleetLocalSource("C:\\Users\\dev\\Code\\skills-fleet\\skills\\mattpocock\\skills\\tdd"),
    ).toBe(true);
    expect(
      isFleetLocalSource("/Users/dev/Code/skills-fleet/.agents/skills/bro"),
    ).toBe(true);
    expect(isFleetLocalSource("/Users/dev/other-repo/skills/my-skill")).toBe(false);
    expect(isFleetLocalSource(undefined)).toBe(false);
  });
});

describe("frontmatter", () => {
  test("parses single-line, quoted, and CRLF frontmatter", () => {
    const md = [
      "---",
      "name: code-review",
      'description: "Review changes and asks to \\"review since X\\"."',
      "argument-hint: '[commit]'",
      "---",
      "",
      "# Body",
    ].join("\r\n");

    expect(parseSkillFrontmatter(md, "fallback")).toEqual({
      name: "code-review",
      description: 'Review changes and asks to "review since X".',
      argumentHint: "[commit]",
    });
  });

  test("parses YAML folded multiline >- descriptions", () => {
    const md = `---
name: sample-skill
description: >-
  Line one of description
  and line two continues cleanly.
hooks:
  Stop:
    - type: command
---
# Content
`;
    expect(parseSkillFrontmatter(md, "fallback")).toEqual({
      name: "sample-skill",
      description: "Line one of description and line two continues cleanly.",
      argumentHint: "",
    });
  });

  test("returns fallback when frontmatter is missing", () => {
    expect(parseSkillFrontmatter("# Just markdown", "my-skill")).toEqual({
      name: "my-skill",
      description: "",
      argumentHint: "",
    });
  });
});

describe("registry and sync planning", () => {
  const lock: SkillsLock = {
    version: 2,
    skills: {
      bro: {
        source: "backnotprop/pstack",
        commit: "abc123",
        sourceType: "github",
        skillPath: "skills/bro/SKILL.md",
        computedHash: "hash-bro",
      },
      tdd: {
        source: "mattpocock\\skills",
        commit: "def456",
        sourceType: "github",
        skillPath: "skills/engineering/tdd/SKILL.md",
        computedHash: "hash-tdd",
      },
    },
  };

  const customSkills = new Map<string, SkillMetadata>([
    [
      "orchestrate-workers",
      {
        name: "orchestrate-workers",
        description: "Orchestrate multi-step worker tasks.",
        argumentHint: "",
      },
    ],
  ]);

  test("builds normalized deterministic config preserving existing metadata", () => {
    const existingConfig: FleetConfig = {
      name: "skills-fleet",
      version: "1.0.0",
      description: "Central registry",
      sources: {},
      skills: {
        bro: { source: "backnotprop/pstack", description: "Restate plainly." },
      },
    };

    const config = buildFleetConfig({ lock, existingConfig, customSkills });
    expect(Object.keys(config.sources)).toEqual([
      "backnotprop/pstack",
      "custom",
      "mattpocock/skills",
    ]);
    expect(config.sources["custom"]).toEqual({
      path: "skills/custom",
      skills: ["orchestrate-workers"],
    });
    expect(config.skills["bro"]?.description).toBe("Restate plainly.");
    expect(config.skills["orchestrate-workers"]?.source).toBe("custom");
  });

  test("generates catalog with GitHub links for upstream and relative links for custom", () => {
    const config = buildFleetConfig({ lock, existingConfig: null, customSkills });
    const md = generateCatalogMarkdown(config, lock);

    expect(md).toContain("[bro](https://github.com/backnotprop/pstack/blob/abc123/skills/bro/SKILL.md)");
    expect(md).toContain("[orchestrate-workers](./skills/custom/orchestrate-workers/SKILL.md)");
    expect(md).not.toContain("\\");
  });

  test("computes batched installs, skips up-to-date skills, and prunes removed fleet skills", () => {
    const config = buildFleetConfig({ lock, existingConfig: null, customSkills });

    const globalLock: GlobalSkillLock = {
      version: 3,
      skills: {
        // Already up to date from GitHub (matching commit in v3 global lock)
        bro: {
          source: "backnotprop/pstack",
          sourceType: "github",
          commit: "abc123",
          skillFolderHash: "git-tree-sha1-differs-from-sha256",
        },
        // Installed via legacy local path -> should be upgraded to GitHub batch
        tdd: {
          source: "C:\\Users\\dev\\Code\\skills-fleet\\skills\\mattpocock\\skills\\tdd",
          sourceType: "local",
          skillFolderHash: "hash-tdd",
        },
        // Removed from fleet -> should be pruned
        impeccable: {
          source: "C:\\Users\\dev\\Code\\skills-fleet\\skills\\pbakaus\\impeccable\\impeccable",
          sourceType: "local",
        },
        // Unrelated user skill -> must NOT be touched
        "personal-helper": {
          source: "someone/else",
          sourceType: "github",
        },
      },
    };

    const plan = computeGlobalSyncPlan({
      config,
      lock,
      globalLock,
      installedGlobalDirs: new Set([
        "bro",
        "tdd",
        "orchestrate-workers",
        "impeccable",
        "personal-helper",
      ]),
      machineState: {
        version: 1,
        installedSkills: ["bro", "design-taste-frontend", "orchestrate-workers"],
        customHashes: { "orchestrate-workers": "old-hash" },
        updatedAt: "2026-11-28T00:00:00.000Z",
      },
      customSkillHashes: { "orchestrate-workers": "new-hash" },
      repoRoot: "C:\\Users\\dev\\Code\\skills-fleet",
    });

    expect(plan.upToDateCount).toBe(1);
    expect(plan.upstreamBatches).toEqual([
      { source: "mattpocock/skills", commit: "def456", skills: ["tdd"] },
    ]);
    expect(plan.customSkills).toEqual(["orchestrate-workers"]);
    expect(plan.toRemove).toEqual(["design-taste-frontend", "impeccable"]);
  });

  test("skips custom skills when content hash matches machine state", () => {
    const config = buildFleetConfig({ lock, existingConfig: null, customSkills });
    const globalLock: GlobalSkillLock = {
      version: 3,
      skills: {
        bro: { source: "backnotprop/pstack", sourceType: "github", commit: "abc123" },
        tdd: { source: "mattpocock/skills", sourceType: "github", commit: "def456" },
      },
    };

    const plan = computeGlobalSyncPlan({
      config,
      lock,
      globalLock,
      installedGlobalDirs: new Set(["bro", "tdd", "orchestrate-workers"]),
      machineState: {
        version: 1,
        installedSkills: ["bro", "tdd", "orchestrate-workers"],
        customHashes: { "orchestrate-workers": "same-hash" },
        updatedAt: "2026-11-28T00:00:00.000Z",
      },
      customSkillHashes: { "orchestrate-workers": "same-hash" },
      repoRoot: "/repo/skills-fleet",
    });

    expect(plan.upToDateCount).toBe(3);
    expect(plan.upstreamBatches).toEqual([]);
    expect(plan.customSkills).toEqual([]);
    expect(plan.toRemove).toEqual([]);
  });
});
