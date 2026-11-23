<!--
Orchestrator: messages to send to a worker session with t3_thread_send. Fill the
{placeholders}. Keep each message short: the worker already has the ticket and the
spec. Cheap models follow the last thing they read, so every "do the next ticket"
message repeats the file list and the stop rule.
-->

# Messages to a worker session

## Next ticket (same session, same lane)

---
Ticket {NN} accepted ({hash}). Now do ticket {MM} ONLY: {absolute path}. Same checkout, same branch, same brief (re-read its Scope lock).
May touch: {exact files}. Verified facts: {one line each, or none}. Ports: {ports}.
Commit `{message}`. Report with report-form.md, then stop.
---

## Critique (a ticket failed a check)

Send it to the session that did the work. Order the findings: behaviour and spec violations first, then states and hierarchy, then polish. Every finding has all four parts. If you don't know the fix, don't send "figure out why and fix it": ask a REPORT-ONLY question first. A failing test can be a real product bug, so look before telling the worker to change the test.

---
Ticket {NN}: changes requested.

1. Observed: {file:line, or screenshot path and region}.
   Spec: {section or requirement number}.
   Change: {the exact change I decided}.
   Verify: {how I will check it}.
2. {...}

Fix only these. Re-run the ticket's checks, commit as a new commit with the message "{message}", and submit with report-form.md.
---

## Report form missed, or a check claimed but not run

Send this once. A second miss means replacing the session.

---
Your report did not follow report-form.md{, and the check "{check}" was not run}. Re-send it in that form with real output.
---

## Answer to BLOCKED

If the answer binds other tickets, also add it to the spec's Amendments and tell the affected sessions. If the blocker exposed a flaw in the ticket, the answer states the correction and any extra file it may touch.

---
{The decision, in one line}. {Extra file allowed: {path}, change: {the one change}; or omit}. Continue ticket {NN}.
---

## Upstream work merged into the lane

---
I merged {branch} into your branch: {merge hash}. It brings {what}. Don't touch {files}. {Then the next-ticket message.}
---

## I fixed the remainder myself

---
I fixed {what} in commit {hash}. Don't revert it or touch those lines. Ticket {NN} is accepted.
---

## Interrupted or cancelled session

Check the tree first. If it's clean, restate the last decision, because the cancelled turn may not have kept it:

---
continue. {Your last run was cancelled before it changed anything (tree clean at {hash}).} {The last decision, in one line.} Continue ticket {NN}.
---

## Takeover (the user wants to take over)

Run `task_cancel` first, never `t3_thread_interrupt` on a child. Then send:

---
REPORT-ONLY. Reply with: the commits you made, what is done, what is not, any servers or listeners you left running, and the exact remaining work.
---
