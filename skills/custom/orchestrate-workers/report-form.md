# Report form

Submit every ticket report in exactly this form. No prose before or after it. Keep it short. Report real output: a check you didn't run is reported as skipped, never as passed.

```
Ticket: {NN}
Status: DONE | BLOCKED | FAILED
Commit: {hash} {message}   (none if BLOCKED or FAILED)

Checks:
- {command}: pass | fail, {counts}   (add "expected X, got Y" when they differ)

Files:
- {path} +{added}/-{removed}

git status: {clean, or the list}

Decisions: {any choice the ticket didn't dictate; "none" is the expected answer}
Deviations: {from the ticket or spec, each with its reason (e.g. "lint rule X rejects the literal form"); or "none"}
Skipped: {anything not done and why; or "none"}
Left running: {servers, ports, scratch files; or "none"}

BLOCKED only:
- Question: {the exact question}
- Options I see: {short list}
- Untouched: {what you didn't change}

FAILED only:
- Check: {which one}
- Output: {the last relevant lines}

UI tickets only:
- Screenshots: {path, state, viewport}
- Layout: {each numeric check: measured vs expected}
```

Status meanings:
- **DONE:** all checks pass and the work is committed.
- **BLOCKED:** you hit something the ticket or spec doesn't settle. Stop and ask; don't choose.
- **FAILED:** a check still fails after 2 honest attempts. Say which, with the output.
