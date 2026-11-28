import { existsSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { SkillMetadata } from "./types.ts";

function unquoteYamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

/**
 * Parse YAML frontmatter from a SKILL.md string, supporting single-line values,
 * quoted scalars with escapes, and YAML block scalars (`>`, `>-`, `|`, `|-`).
 */
export function parseSkillFrontmatter(content: string, fallbackName: string): SkillMetadata {
  const fallback: SkillMetadata = {
    name: fallbackName || "unknown",
    description: "",
    argumentHint: "",
  };

  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n") && !normalized.startsWith("--- ")) {
    return fallback;
  }

  const endIdx = normalized.indexOf("\n---", 3);
  if (endIdx === -1) return fallback;

  const lines = normalized.slice(4, endIdx).split("\n");
  const fields: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only inspect top-level YAML keys (no leading indentation).
    const match = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawRest] = match;
    const rest = rawRest.trim();

    if (rest === ">" || rest === ">-" || rest === "|" || rest === "|-") {
      const isLiteral = rest.startsWith("|");
      const blockLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (nextLine.trim() === "") {
          blockLines.push("");
          j++;
          continue;
        }
        if (!/^[ \t]+/.test(nextLine)) break;
        blockLines.push(nextLine.trim());
        j++;
      }
      i = j - 1;
      fields[key] = (isLiteral ? blockLines.join("\n") : blockLines.join(" ")).trim();
      continue;
    }

    if (rest === "") {
      // Check for indented plain scalar continuation lines (not nested YAML mappings).
      const contLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^[ \t]+/.test(lines[j])) {
        const trimmed = lines[j].trim();
        if (/^[a-zA-Z0-9_-]+:\s*/.test(trimmed)) break;
        if (trimmed.length > 0) contLines.push(trimmed);
        j++;
      }
      if (contLines.length > 0) {
        i = j - 1;
        fields[key] = contLines.join(" ");
      } else {
        fields[key] = "";
      }
      continue;
    }

    // Handle multi-line continuation for plain/quoted single value spanning lines.
    const valueLines = [rest];
    let j = i + 1;
    while (j < lines.length && /^[ \t]+/.test(lines[j])) {
      const trimmed = lines[j].trim();
      if (!trimmed || /^[a-zA-Z0-9_-]+:\s*/.test(trimmed)) break;
      valueLines.push(trimmed);
      j++;
    }
    i = j - 1;
    fields[key] = unquoteYamlScalar(valueLines.join(" "));
  }

  return {
    name: fields["name"] || fallback.name,
    description: fields["description"] || "",
    argumentHint: fields["argument-hint"] || "",
  };
}

export function parseSkillFrontmatterFromFile(
  skillMdPath: string,
  fallbackName?: string,
): SkillMetadata {
  const name = fallbackName || basename(dirname(skillMdPath)) || "unknown";
  if (!existsSync(skillMdPath)) {
    return { name, description: "", argumentHint: "" };
  }
  try {
    const content = readFileSync(skillMdPath, "utf-8");
    return parseSkillFrontmatter(content, name);
  } catch {
    return { name, description: "", argumentHint: "" };
  }
}
