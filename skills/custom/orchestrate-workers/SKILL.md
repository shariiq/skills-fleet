---
name: orchestrate-workers
description: In T3 Code, run a multi-step task with the main model writing the spec and tickets, making the valuable decisions and verifying, while cheaper worker models implement in persistent T3 sessions it steers and critiques. Use when the user names orchestrate-workers or asks to delegate implementation to a cheaper model ("have DeepSeek/Haiku/Sonnet implement it, you plan and verify"). Not for tasks that are a single ticket or under about 100 changed lines (unless the user names this skill), and not for exploratory or ambiguous work where the spec cannot be written up front.
disable-model-invocation: true
---

# Orchestrate Workers

You are the expensive, careful model. Workers are cheaper and faster, but they make poor design decisions. Spend your tokens on decisions (spec, tickets, verification); workers spend theirs on typing, running suites and capturing screenshots.

You succeed when the work is correct, verified by you, committed cleanly, and little of your time and tokens went anywhere but decisions and verification. A worker's report is a claim until you have seen the evidence yourself. So is a reviewer's.

Cost and speed come from the same habits:
- write each decision once, in the spec;
- keep messages and reports short;
- never re-read or re-run what a worker did unless you are verifying a claim;
- never poll;
- run independent work in parallel;
- do small things yourself instead of paying for a ticket or another round.

**Templates** sit in this skill's folder: `worker-brief.md`, `ticket.md`, `report-form.md`, `critique.md` and `index.md`. Fill their placeholders; don't rewrite them from memory. Copy `report-form.md` and `index.md` next to the spec so workers read the form by absolute path.

## Inputs

From the user's message, take:
- the task;
- the worker model (ask once if it's missing);
- the effort;
- an optional reviewer model;
- extra rules: forbidden commands, whether pushing is allowed.

- **Effort** defaults to `high` on every session, recon and review included. This is deliberate: cheaper models make more design slips at low effort, and one rework cycle costs more than the extra tokens. Lower it only when the user says so, and keep the user's value until they change it.
- **Models:** recon uses the worker model. Review uses the reviewer model if one was given, otherwise the worker model. A mid-run change of model or effort applies from the next ticket:
  - same provider: run `t3_thread_configure` on the worker thread;
  - different provider: open a new session.

  Your own model can't change during your turn.

## Small tasks

**A single ticket or under about 100 changed lines:** say so in one line and do it directly. If the user named this skill anyway, take the light path:
- one worker session;
- the plan in a line or two, with no spec file;
- no plan check and no review session;
- one closing pass by you: re-run the checks, `git status`, read the diff.

**The same test applies per ticket.** If a ticket would be about as long as the diff it describes, or the change is one mechanical edit, make the change yourself and mark it "mine" in the index.

## Flow

1. **Clarify.**
   - Confirm it's a git repo, and record the baseline branch, SHA and `git status`.
   - The harness already loads the root agent guide (AGENTS.md or its equivalent) into every session, yours and the workers'. Don't tell anyone to read it. Read the guides it points to for the files in scope, and note its rules and **owner stops**: points where the guides require the user's decision.
   - Ask the user only what blocks the spec, batched in one message with a recommended default for each.
   - If part of the request would evade legal, safety or security controls, scope that part out and say so here.
2. **Recon.** REPORT-ONLY worker sessions (read and run read-only commands, no edits) gather facts:
   - framework behaviour;
   - exact API names;
   - file naming;
   - contracts;
   - what the mocks support.

   Facts, not opinions. Use the recon brief in `worker-brief.md`. Ask one question per uncertainty that a ticket would otherwise leave to the worker. Recon runs in parallel with tickets that don't depend on it. A ticket that does depend on it stays `draft` until you finalize it from the answers.
3. **Spec.** Write it to a file in the repo's planning-docs location, or in a scratch folder listed in `.git/info/exclude` (not `.gitignore`, which dirties the tree). It records decisions and their reasons, sized to the task:
   - the problem and numbered requirements;
   - the behaviour contract, with edge cases;
   - exact interfaces and user-visible strings;
   - failure handling;
   - testing decisions: test at the highest existing seam, and assert observable behaviour;
   - checks;
   - what's out of scope.

   Use the repo's glossary, ADRs and guides. Two different workers given the spec should produce the same behaviour. Don't pad it. After execution starts, change the spec only by appending a dated Amendments section that names the affected tickets, and tell the affected sessions.
4. **Ticket index.** Slice the work into tracer-bullet vertical slices, not layers, with behaviour-preserving prefactors first. Each ticket is one commit, a diff reviewable in minutes, with an explicit blocked-by. Create `index.md` with one row per ticket: title, lane, blocked-by, covers. Write the full ticket files after the plan check.
5. **Plan check.** Show the user once: the test seams, the ticket index, and the session shape (which sessions, which parallel lanes). "ok" is a valid reply. Skip it only if the user said to run without stops; then state the plan and proceed. Always stop at an owner stop. If the user changes the plan, update the spec and the index before writing any ticket.
6. **Tickets.** Write each full ticket from `ticket.md`.
   - If writing one exposes a spec gap, fix the spec. Go back to the user only if the fix changes what they approved.
   - Before sending, check the type fallout: if a new signature breaks callers, list those callers under "May touch", each with the one change it may get.
   - Ticket files don't change once sent; corrections go in critique.
7. **Execute.** Send tickets to sessions, start every independent lane at once, and end your turn; completion wakes you. Then verify, critique until the ticket passes, and accept.
8. **Integrate.** You do every merge yourself (see Parallel lanes).
9. **Review.** After the last ticket, a fresh REPORT-ONLY session reads the spec and the full diff, using the review brief in `worker-brief.md`. For UI, look at the final screenshots yourself. Triage each finding:
   - real and small: fix it yourself;
   - real and larger: send critique to a fresh session;
   - the spec was too broad, or the finding is a deliberate trade-off: narrow the spec in an Amendment and decline the finding.

   Record every finding, accepted or declined, with its reason in the index.
10. **Finish.**
    - Re-run the key checks yourself, then the repo's formatter.
    - Clean up:
      - remove every worktree the run created;
      - delete merged lane branches, including empty ones the host created;
      - confirm no servers or ports are left running;
      - delete scratch files.
    - Summarize from real output: tickets with hashes, check results with counts, deviations from the spec, anything unverified, the model pin result.
    - Don't push unless allowed.

## Who decides what

You own the valuable decisions:
- scope and architecture;
- interfaces and data;
- user-visible behaviour and text;
- visual values;
- test strategy and fix strategy;
- acceptance;
- merges.

Workers own trivial ones: cheap to change, invisible outside one function, not an interface. A ticket is ready only when the worker has no valuable decision left to make. That means:
- exact file paths and signatures;
- user-facing strings;
- an expected result for every check;
- for UI: the element tree, the layout rules at each breakpoint, and numeric layout checks written as sentences with viewports.

If you can't write one of these, the spec has a gap; close it in the spec. A worker that has to design is the slowest and least reliable part of the loop.

Workers stop and report BLOCKED rather than choose, with one exception the brief allows: the smallest change a lint or type rule forces, reported under Deviations. Accept such a deviation on its merits.

## State

Keep state in files, not in your head. `index.md` next to the spec holds:
- a row per ticket: lane, blocked-by, covers, status, commit, session;
- the baseline;
- the model pin result;
- lanes, sessions and merges;
- checkpoint results;
- review triage;
- cleanup.

Update it at every state change, and re-read it after your context compacts.

## Sessions

- **Opening:** call `orchestrator_capabilities` once per thread, then use `delegate_task`. Set the model and the reasoning option from that list on every new session; never inherit your own.
- **The kickoff brief** comes from `worker-brief.md`, under 40 lines. Its "Scope lock" is the part that keeps cheap models on task, so don't trim it.
- **Later messages** use `critique.md`. Every "next ticket" message repeats the ticket path, the "May touch" list, the verified facts and the stop rule: cheap models follow the last thing they read.
- **Reuse a session** only when its context helps: the next ticket in the same lane, or a fix to its own ticket. Unrelated tickets, critics and reviews get a fresh session. Replace a session that repeats a corrected mistake, contradicts the spec, or needs a different model or provider.
- **Reports:**
  - A report that ignores `report-form.md`, or claims a check you find it didn't run, gets the form re-sent once. A second miss counts as a repeated mistake: replace the session.
  - **BLOCKED:** answer in one line. If the blocker shows a flaw in the ticket, state the correction and any extra file it may touch. If the answer binds other tickets, add it to the Amendments.
- **Interrupted or cancelled session:** check the tree, then send `continue` with the last decision restated, in the same session. Don't open a fresh session for the same ticket.
- **Stopping a worker:** `task_cancel`, never `t3_thread_interrupt` on a child. If the user wants you to take over, cancel, send the takeover message from `critique.md`, and finish the remaining work yourself.
- **Model pin:** after the first session, check `executedModel`.
  - Your own model, or a different one from the one requested: a hard stop. Ask once for a valid name and never fall back silently.
  - `null` (some providers don't report it): record "not reported" in the index and continue on the requested model id. Escalate only if the behaviour suggests a different model.

## Parallel lanes

Run lanes in parallel only when their files are disjoint and the interfaces between them are settled. Each lane gets:
- `isolation: "worktree"`;
- its own ports;
- its own branch, which the worker creates first.

- **Committed files only.** A worktree has only committed files, so lane sessions read the spec and tickets by absolute path in the main checkout.
- **Start lanes early.** Start a lane as soon as its first tickets don't depend on unmerged work. This was the biggest speed win available.
- **Merge upstream work in yourself.** Before a lane ticket that needs another branch's work, run `git merge --no-ff` of that branch into the lane, check it's green, and tell the worker the merge hash and which files not to touch.
- **Warn about shared files.** Tell both lanes about files each will create (a shared test file, for example) so their blocks merge cleanly.
- **Integration is yours, never a worker ticket.** Merge the lanes one at a time with `--no-ff` and resolve conflicts yourself:
  - regenerate generated files instead of hand-merging them;
  - for files both lanes created, keep both sides.

  Then re-run the checks. A conflict whose resolution changes a spec decision is a hard stop.

## Verify and critique

Workers have already run the full suites and captures, so you run only the ticket's checks plus short targeted reads. Filter the output to the last 20 lines, counts and failures, so a test dump never floods your context.

1. **Read the commit, weighted by risk.** Read all of an interface, state, persistence, security or HTTP change; skim mechanical edits.
2. **Look for the silent defects** cheap models report as clean:
   - non-ASCII characters replaced with ASCII;
   - comments deleted or rewritten outside the ticket;
   - a behaviour applied more broadly than specified;
   - expected test values changed to match the code.
3. **Compare `git status`** with the baseline plus the accepted tickets.
4. **For UI,** open the screenshots yourself and check the numbers.

**Pass:** mark the ticket accepted in the index with the hash.

**Tooling:** use the repo's own test runner, lint, typecheck and screenshot tool. Don't build scripts, harnesses or shared measurement tools. The ticket says exactly how to configure the existing tools for this change: config file and keys, states, viewports, output folder, command, and what to restore afterwards. Layout numbers are sentences in the ticket's checks, measured with existing tooling or a throwaway snippet the worker doesn't commit.

**Fail:** send critique from `critique.md` to the session that did the work: what you observed, what the spec says, the exact change you decided, and how you will verify. Behaviour and spec violations come first, then states and hierarchy, then polish. Never send "figure out why and fix it"; if you don't know the fix, ask a REPORT-ONLY question first. A failing test can be a real product bug, so look before telling the worker to change the test.

**Fix it yourself** when the same check fails twice, or what remains is small (a lint nit, a restored character, a one-line logic fix). Commit the fix separately, tell the worker not to revert it, and record "accepted + {hash} (mine)". Don't pay for a third cycle.

## Escalation

Ask the user only at clarify, the plan check, an owner stop, or a hard stop. Hard stops:
- not a git repo;
- a wrong, unavailable or ignored model pin (`null` is not a hard stop, see Sessions);
- a commit the user must unblock (hooks, signing, branch rules);
- a merge conflict whose resolution changes a spec decision;
- an issue still unresolved after your own fix, or whose fix would change a spec decision;
- the same blocker three times (stop that ticket and report the evidence).
