<!--
Orchestrator: one file per ticket, named NN-short-title.md. A fresh session must be
able to do the ticket from the files alone. Point to spec sections instead of
restating them. Delete sections that don't apply. The ticket is ready only when
the worker has no decision that matters left to make. Don't edit a ticket after
sending it; corrections go in critique.

Before writing a ticket, check whether it's worth delegating. If the ticket would be
about as long as the diff it describes, or the change is one mechanical edit, make
the change yourself and record it in the index as "mine".
-->

# {NN} - {title}

**Checkout:** {main checkout | lane worktree}, branch `{branch}`
**Blocked by:** {ticket numbers, merges or recon questions; or none}
**Covers:** {spec sections / requirement numbers}
**Read first:** {spec sections, and only the guides this ticket needs beyond the root agent guide}
**May touch:** {exact file paths}. Anything else is a stop: report BLOCKED.

{If a new signature breaks callers, list those callers above with the one change each may get.}

## Verified facts
{What recon or you already proved, so the worker doesn't re-investigate: API names, import paths, observed behaviour, mock toggles. Omit if there are none.}

## Goal
{One or two sentences: the observable result.}

## Behaviour
| Input / state | Result |
|---------------|--------|
| {case, including every edge case and failure branch} | {observable result} |

## Interfaces and strings (exact)
{Signatures, types, file paths, user-visible strings, failure handling. Copy exact values from the spec. No rationale.}

## Steps
{Only where the order matters. Otherwise omit.}

## UI (UI tickets only)
- Element tree: {tree, including conditional regions per state}
- Layout per breakpoint: {grid or flex, which element scrolls, what wraps, what is hidden}
- Tokens: {existing tokens; any new custom property with its value and scope}
- Strings for every state the repo's UI guide requires: {loading, empty, error, retry, ...}
- Numeric checks, as sentences with viewports: {e.g. "At 390px wide the sidebar is hidden and the list is 358px wide."}

## Tests
Seam: {the highest existing seam}. Assert observable behaviour.

| Given | When | Then |
|-------|------|------|
| {state} | {action} | {observable result} |

## Checks
Each check is a command with its expected result.

| Command | Expected |
|---------|----------|
| {command, with env vars and ports} | {exact expected result, e.g. "0 failures, 14 passed"} |

Tooling setup: {config file and keys, states, viewports, output folder}. Restore afterwards: {tracked config, env vars, ports}.

## Commit
Message: `{commit message}`

## Done when
Every check shows its expected result, and `git status` lists only the files under "May touch".
