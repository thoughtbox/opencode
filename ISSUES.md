# Issues

## Review Scope
- All files in the template repo
- Documentation/template repo with shell scripts and OpenCode config
- No application code; risk surface is config correctness, shell safety, and documentation accuracy

## Overall Assessment
- All identified issues have been fixed

## Priority Summary

All 4 findings from the initial review have been resolved:

1. ~~[Medium] Unset MEMPALACE_PYTHON produces opaque MCP failure~~ — **Fixed**: added `launch-mempalace.sh` that validates the variable and prints a clear error
2. ~~[Medium] setup.sh assumes Unix venv layout~~ — **Fixed**: `setup.sh` now probes `bin/python`, `Scripts/python.exe`, and `Scripts/python` after venv creation
3. ~~[Low] README heading hierarchy broken~~ — **Fixed**: numbered steps and file descriptions are now h3 under their h2 parents
4. ~~[Low] Heredoc output breaks on paths with special characters~~ — **Fixed**: replaced heredoc with `printf` to avoid unquoted expansion

## Fixes Applied

### [Medium] Unset MEMPALACE_PYTHON produces opaque MCP failure
- Original location: `opencode.json:10-11`
- Fix: Added `launch-mempalace.sh` as a launcher script that checks `MEMPALACE_PYTHON` is set and executable before calling `python -m mempalace.mcp_server`. Updated `opencode.json` to call the launcher instead of using `{env:MEMPALACE_PYTHON}` directly in the command array.
- Files changed: `opencode.json`, new file `launch-mempalace.sh`

### [Medium] setup.sh assumes Unix venv layout
- Original location: `setup.sh:7`
- Fix: Replaced the hardcoded `$VENV_DIR/bin/python` assignment with a post-creation probe that checks `bin/python`, `Scripts/python.exe`, and `Scripts/python` in order. Exits with a clear error if none are found.
- Files changed: `setup.sh`

### [Low] README heading hierarchy broken
- Original location: `README.md:53-68`
- Fix: Changed all numbered quick-start steps and file descriptions from `##` (h2) to `###` (h3) so they nest under their parent sections.
- Files changed: `README.md`

### [Low] Heredoc output breaks on paths with special characters
- Original location: `setup.sh:19-21`
- Fix: Replaced the `cat > "$ENV_FILE" <<EOF` heredoc with `printf 'export MEMPALACE_PYTHON="%s"\n' "$MEMPALACE_PYTHON" > "$ENV_FILE"`, which avoids unquoted shell expansion of the path value.
- Files changed: `setup.sh`

## Missing or Weak Tests
- No automated tests exist. Highest-value additions for a future CI pipeline:
  1. `shellcheck` pass on `setup.sh` and `launch-mempalace.sh`
  2. JSON schema validation of `opencode.json` against `https://opencode.ai/config.json`
  3. Markdown lint pass to enforce heading hierarchy

## Positive Notes
- `set -eu` in both shell scripts catches errors early
- All shell variables are consistently double-quoted, avoiding word-splitting and globbing bugs
- `command -v` is the portable POSIX way to check for a binary; preferred over `which`
- `launch-mempalace.sh` uses `exec` to replace itself with the Python process, avoiding an unnecessary parent shell
- `.gitignore` correctly excludes `.env.local` and `.env` to prevent accidental secret commits
- Attribution to the upstream MemPalace project is thorough and well-placed

## Unverified Areas
- Whether the MemPalace MCP server starts cleanly with no palace initialized (the template instructs users to init first, but the error path if they skip that step is unknown)
- Whether OpenCode's MCP timeout default of 5 seconds is long enough for the MemPalace MCP server's Python startup time, especially on first run when ChromaDB initializes
