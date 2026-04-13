# MemPalace Instructions

Use MemPalace when a task depends on prior context instead of only the current repository state.

Consult MemPalace before making assumptions about:

- past architecture decisions
- earlier debugging sessions
- previous migrations or refactors
- project-specific preferences or conventions
- prior AI conversations or exported team discussions

When MemPalace is relevant:

1. Search memory first.
2. Use the retrieved context to guide the plan or implementation.
3. Prefer retrieved history over guessing.
4. If memory results conflict or are thin, say that explicitly.

Examples of when to use it:

- "why did we switch from REST to GraphQL?"
- "what did we decide about auth last month?"
- "have we already tried this retry strategy?"
- "what were the reasons for choosing Postgres here?"

Do not call MemPalace for trivial purely local edits that are fully answerable from the current code.
