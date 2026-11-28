export interface SkillLockEntry {
  source: string;
  commit?: string;
  ref?: string;
  sourceType?: string;
  sourceUrl?: string;
  skillPath?: string;
  skillName?: string;
  computedHash?: string;
}

export interface SkillsLock {
  version: number;
  skills: Record<string, SkillLockEntry>;
}

export interface SkillMetadata {
  name: string;
  description: string;
  argumentHint: string;
}

export interface SkillRegistryMeta {
  source: string;
  description?: string;
  argumentHint?: string;
}

export interface SourceRegistryEntry {
  skills: string[];
  path?: string;
}

export interface FleetConfig {
  name: string;
  version: string;
  description: string;
  sources: Record<string, SourceRegistryEntry>;
  skills: Record<string, SkillRegistryMeta>;
}

export interface GlobalSkillLockEntry {
  source?: string;
  sourceType?: string;
  sourceUrl?: string;
  commit?: string;
  skillPath?: string;
  skillFolderHash?: string;
  ref?: string;
}

export interface GlobalSkillLock {
  version: number;
  skills: Record<string, GlobalSkillLockEntry>;
}

export interface FleetMachineState {
  version: number;
  installedSkills: string[];
  customHashes?: Record<string, string>;
  updatedAt: string;
}

export interface UpstreamInstallBatch {
  source: string;
  commit?: string;
  skills: string[];
}

export interface GlobalSyncPlan {
  toRemove: string[];
  upstreamBatches: UpstreamInstallBatch[];
  customSkills: string[];
  upToDateCount: number;
}
