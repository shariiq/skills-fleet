<!--
Orchestrator: copy this next to the spec as index.md. It's the only state that
survives context compaction. Update it at every state change, and re-read it after
compaction before you act.
-->

# {initiative}: ticket index

Spec {path} · Report form {path}

Baseline: `{branch}` at `{sha}`, `git status` {clean | list}. Work branch: `{branch}`.
Worker: {provider/model, effort}. Reviewer: {provider/model, effort}.
Model pin: {the executedModel seen | "not reported by the provider"}.

| NN | Title | Lane | Blocked by | Covers | Status | Commit | Session |
|----|-------|------|------------|--------|--------|--------|---------|
| R0 | {recon} | main | none | {tickets it unblocks} | ready | none | none |
| 01 | {title} | main | none | {S2.1} | ready | none | none |

Status values: draft (waits on recon) · ready · in progress · submitted · blocked · changes requested · accepted · accepted + {hash} (mine) · mine (done without a worker) · closed by owner.

Lanes: {lane: worktree path, branch, ports}
Sessions: {link: model, what it owns}
Merges: {upstream merges into lanes, integration merges, with hashes}
Checkpoints: {checkpoint: commands and counts}
Review: {each finding: accepted / declined, with the reason}
Cleanup: {worktrees removed, branches deleted, ports confirmed free}
