# approval

Human-in-the-loop gates. One node: `approve` (kind `hook`) — the compiler's
HOOK primitive suspends the run (`createHook`/`await`, D02 §5) until a resume
event arrives through the control plane carrying a human decision.

The pack owns only what is ITS: normalizing the resume payload (decisions are
exactly `approved` | `rejected`, case-insensitive on input, canonical on the
port), optional approver provenance, and an optional expiry window. Anything
that cannot be parsed fails CLOSED as `INVALID_DECISION` — an approval that
cannot be read is never interpreted as either outcome.
