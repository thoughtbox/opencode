# MemPalace for OpenCode

[![OpenCode](https://img.shields.io/badge/OpenCode-MCP%20client-black)](https://github.com/anomalyco/opencode)
[![MemPalace](https://img.shields.io/badge/MemPalace-local%20memory-blue)](https://github.com/MemPalace/mempalace)
[![Upstream Repo](https://img.shields.io/badge/upstream-MemPalace%2Fmempalace-6f42c1)](https://github.com/MemPalace/mempalace)
[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB)](https://www.python.org/)

Use [MemPalace](https://github.com/MemPalace/mempalace) as a local memory layer for [OpenCode](https://github.com/anomalyco/opencode).

This template lets OpenCode search prior project context, chat exports, and earlier decisions through MemPalace's MCP server.

Community template. Not affiliated with the OpenCode team.

## Upstream Credit

This template exists to help OpenCode users work with the upstream [MemPalace](https://github.com/MemPalace/mempalace) project.

MemPalace itself is the work of its upstream author, listed in the project metadata as `milla-jovovich`, along with the broader MemPalace contributor community. If you are evaluating the memory system, benchmarking claims, implementation details, or filing upstream bugs and feature requests, use the original repository:

- Upstream repo: `https://github.com/MemPalace/mempalace`
- Upstream project page: `https://github.com/MemPalace/mempalace`
- Upstream author reference from package metadata: `milla-jovovich`

This repo is only an OpenCode-oriented integration template and documentation layer around that upstream work.

## Included

- `README.md`: setup and usage guide
- `opencode.json`: OpenCode MCP config for the MemPalace server
- `launch-mempalace.sh`: validates `MEMPALACE_PYTHON` and starts the MCP server
- `.opencode/plugins/mempalace-autosave.js`: incrementally builds full session transcripts and syncs them into MemPalace
- `mempalace-autosave-sync.py`: upserts stable per-session autosave drawers into MemPalace
- `mempalace-autosave-mine.sh`: manually re-sync the autosave spool if needed
- `AGENTS.md`: project instructions for when to use memory
- `.env.example`: environment variable template
- `setup.sh`: installs MemPalace, detects OS, and writes `.env.local`

## What works today

- Mine project files into MemPalace
- Mine chat exports into MemPalace
- Expose MemPalace to OpenCode as a local MCP server
- Auto-save full OpenCode idle-session transcripts into a local spool and sync them into MemPalace
- Tell OpenCode to consult memory before making historical or architectural assumptions

## What to know

OpenCode now exposes a plugin system with event hooks. This template uses a local plugin under `.opencode/plugins/` to cache message events, flush the full session transcript on `session.idle`, and then sync that transcript into MemPalace with stable drawer IDs.

This is a practical local-first transcript exporter. It rewrites one transcript file per session and upserts only changed MemPalace drawers so repeat autosaves update the same conversation instead of accumulating duplicate snapshots.

Autosave files are written with restrictive permissions when the filesystem supports them, and `.mempalace-autosave/` is ignored by git.

## How it fits together

```text
project files / chat exports / autosave spool
                    |
                    v
             mempalace mine
                    |
                    v
           local MemPalace index
                    |
                    v
          launch-mempalace.sh
                    |
                    v
          mempalace.mcp_server
                    |
                    v
                 OpenCode
                    |
                    v
    plugin saves idle sessions to spool
```

## Quick Start

### 1. Install MemPalace

Fastest path:

```bash
./setup.sh
. ./.env.local
```

Manual path:

```bash
python3 -m venv ~/.venvs/mempalace
~/.venvs/mempalace/bin/pip install --upgrade pip
~/.venvs/mempalace/bin/pip install mempalace
```

### 2. Set MEMPALACE_PYTHON permanently

The launcher script (`launch-mempalace.sh`) reads the `MEMPALACE_PYTHON` environment variable to find the Python that has MemPalace installed. If the variable is missing or points to a bad path, the launcher prints a clear error and exits.

`setup.sh` writes a `.env.local` file with the correct value, but that file only takes effect when you source it manually. To make the variable available every time you open a terminal, add it to your shell profile.

**For Bash** (`~/.bashrc`):

```bash
echo 'export MEMPALACE_PYTHON="$HOME/.venvs/mempalace/bin/python"' >> ~/.bashrc
source ~/.bashrc
```

**For Zsh** (`~/.zshrc`):

```bash
echo 'export MEMPALACE_PYTHON="$HOME/.venvs/mempalace/bin/python"' >> ~/.zshrc
source ~/.zshrc
```

**For Fish** (`~/.config/fish/config.fish`):

```fish
set -Ux MEMPALACE_PYTHON "$HOME/.venvs/mempalace/bin/python"
```

If `setup.sh` detected a different path (for example on Windows), check `.env.local` for the actual value and use that instead.

You can verify the variable is set correctly by opening a new terminal and running:

```bash
echo $MEMPALACE_PYTHON
```

It should print the full path to the Python executable inside the MemPalace venv.

### 3. Choose where to put the OpenCode config

OpenCode loads config from multiple locations and merges them together. You have two choices for where to put the MemPalace MCP config:

| Location | Scope | Best for |
|---|---|---|
| `~/.config/opencode/opencode.json` | Every project you open | Most users. MemPalace memory is useful everywhere. |
| `<project>/opencode.json` | Only that one project | If you only want memory in specific repos. |

**Recommended for beginners: use global config.** This way MemPalace is available no matter which project you open in OpenCode.

#### Global setup (recommended)

Copy `launch-mempalace.sh` somewhere permanent and add the MCP block to your global config:

```bash
# Copy the launcher to a permanent location
cp launch-mempalace.sh ~/.config/opencode/launch-mempalace.sh
chmod +x ~/.config/opencode/launch-mempalace.sh
```

Then add the MCP block to `~/.config/opencode/opencode.json` (create the file if it doesn't exist):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "mempalace": {
      "type": "local",
      "enabled": true,
      "command": [
        "/home/your-user/.config/opencode/launch-mempalace.sh"
      ]
    }
  }
}
```

Replace `/home/your-user` with your actual home directory. The path must be absolute when used in global config.

You can also copy `AGENTS.md` into your global config directory so the memory instructions apply everywhere:

```bash
cp AGENTS.md ~/.config/opencode/agents/mempalace.md
```

#### Per-project setup

If you only want MemPalace in one project, copy `opencode.json`, `launch-mempalace.sh`, and `AGENTS.md` into that project's root. The relative path (`./launch-mempalace.sh`) works when the config is in the project directory.

#### If you already have an opencode.json

OpenCode merges configs, so you only need to add the `mcp` block to your existing file. You do not need to replace the whole file.

### 4. Initialize and mine data

```bash
~/.venvs/mempalace/bin/mempalace init ~/projects/myapp
~/.venvs/mempalace/bin/mempalace mine ~/projects/myapp
~/.venvs/mempalace/bin/mempalace mine ~/chat-exports --mode convos
```

If your transcript exports contain many sessions in one file:

```bash
~/.venvs/mempalace/bin/mempalace split ~/chat-exports --dry-run
~/.venvs/mempalace/bin/mempalace split ~/chat-exports
```

### 5. Start OpenCode

```bash
opencode
```

If the project has not been initialized for OpenCode yet, run:

```text
/init
```

### 6. Ask OpenCode to use memory

Examples:

```text
Use MemPalace to find previous decisions about auth before changing the login flow.
```

```text
Search memory for earlier discussions about retries and background jobs, then use that context in your plan.
```

```text
What did we previously decide about Postgres indexes in this codebase? Use MemPalace if needed.
```

### 7. Auto-save behavior

The included OpenCode plugin listens for `session.idle` events.

When a session becomes idle it:

- uses the incremental in-memory session cache, hydrating from OpenCode once after plugin startup if needed
- rewrites the full transcript at `.mempalace-autosave/sessions/<session-id>.txt`
- syncs only changed transcript chunks into MemPalace with stable per-session drawer IDs
- skips duplicate syncs when the transcript content has not changed
- omits raw tool output from the persisted transcript

If you want the autosave spool somewhere else, set:

```bash
export MEMPALACE_AUTOSAVE_DIR="$HOME/.local/share/opencode-mempalace"
```

You can also re-sync the spool manually:

```bash
./mempalace-autosave-mine.sh
```

Or with an explicit path:

```bash
./mempalace-autosave-mine.sh /path/to/autosave-dir
```

## Files

### `opencode.json`

Registers MemPalace as a local MCP server for OpenCode. This file can be placed either in `~/.config/opencode/` for global use or in a project root for per-project use. See [step 3](#3-choose-where-to-put-the-opencode-config) for details.

It calls `launch-mempalace.sh`, which validates `MEMPALACE_PYTHON` and starts the server. It also loads `AGENTS.md` as a project instruction file.

### `.opencode/plugins/mempalace-autosave.js`

Project-local OpenCode plugin. Hooks into `session.idle`, exports the full session transcript to `.mempalace-autosave/sessions/<session-id>.txt`, and invokes the sync script.

### `mempalace-autosave-sync.py`

Reads autosave transcript files, chunks them like MemPalace conversation imports, and upserts stable drawers keyed by transcript path plus chunk index. Unchanged chunks are skipped and stale chunk IDs are deleted so later autosaves update the same session instead of creating duplicate history.

### `mempalace-autosave-mine.sh`

Helper script for manually re-syncing the autosave spool. Uses `MEMPALACE_AUTOSAVE_DIR` if set, otherwise defaults to `.mempalace-autosave`.

### `launch-mempalace.sh`

Validates that `MEMPALACE_PYTHON` is set and points to an executable Python, then starts `mempalace.mcp_server`. Provides clear error messages if the variable is missing or the path is wrong.

### `AGENTS.md`

Tells OpenCode when it should consult memory first, especially for:

- earlier design decisions
- debugging history
- migrations
- project-specific conventions
- previous AI or team discussions

### `.env.example`

Shows the one environment variable the template expects:

- `MEMPALACE_PYTHON`

### `setup.sh`

This script:

- creates `~/.venvs/mempalace` by default
- installs or upgrades `mempalace`
- detects the correct venv binary path (`bin/python` on Unix, `Scripts/python.exe` on Windows)
- writes `.env.local` with the resolved path
- exports `MEMPALACE_PYTHON` for the script's shell

Optional overrides:

```bash
MEMPALACE_VENV_DIR="$HOME/.venvs/custom-mempalace" ./setup.sh
PYTHON_BIN=python3.11 ./setup.sh
ENV_FILE=.env.local ./setup.sh
```

## Refresh workflow

Re-run mining whenever the underlying source material changes.

```bash
~/.venvs/mempalace/bin/mempalace mine ~/projects/myapp
~/.venvs/mempalace/bin/mempalace mine ~/chat-exports --mode convos
```

## Verify MemPalace itself

```bash
~/.venvs/mempalace/bin/mempalace status
~/.venvs/mempalace/bin/mempalace search "why did we switch auth providers"
```

## Run Local Tests

This repo includes a minimal regression harness for the autosave integration.

```bash
./run-tests.sh
```

Equivalent individual commands:

```bash
node tests/test-mempalace-autosave-plugin.mjs
python3 -m unittest tests/test_mempalace_autosave_sync.py
```

## Troubleshooting

If OpenCode is not using MemPalace:

1. Confirm `MEMPALACE_PYTHON` points to the Python where `mempalace` is installed.
2. Run the launcher directly to check for errors:

```bash
./launch-mempalace.sh
```

3. Restart OpenCode after changing `opencode.json` or environment variables.
4. Strengthen the guidance in `AGENTS.md` if the agent still guesses instead of searching.
5. If you used `./setup.sh`, make sure you also loaded `.env.local` in the shell where you launch OpenCode.

If retrieval quality is weak:

1. Re-run `mempalace mine` on the relevant repo or export directory.
2. Use better search terms: feature names, migration names, people, project names, or exact terms from prior discussions.
3. Split oversized transcript exports before mining.

## Notes

- MemPalace's storage and retrieval are local-first.
- The benchmark headline in the upstream repo is based on raw mode, not AAAK compression mode.
- This template is intentionally minimal and OpenCode-specific.
- Credit for MemPalace belongs to the upstream project and its author/contributors, not to this template repo.

## Publish Checklist

Before publishing this template, update:

- repository name and description
- any custom example paths in the README
- your preferred default `AGENTS.md` wording

## Attribution Summary

- Core memory system: [MemPalace](https://github.com/MemPalace/mempalace)
- Upstream repository: `MemPalace/mempalace`
- Upstream author reference in package metadata: `milla-jovovich`
- This repo: OpenCode integration template and docs only
