#!/usr/bin/env sh

# Launcher for the MemPalace MCP server.
# Called by OpenCode via opencode.json.
# Validates MEMPALACE_PYTHON before starting the server.

set -eu

if [ -z "${MEMPALACE_PYTHON:-}" ]; then
  printf 'error: MEMPALACE_PYTHON is not set.\n' >&2
  printf 'Run: export MEMPALACE_PYTHON="$HOME/.venvs/mempalace/bin/python"\n' >&2
  printf 'Or run ./setup.sh and source .env.local first.\n' >&2
  exit 1
fi

if [ ! -x "$MEMPALACE_PYTHON" ]; then
  printf 'error: MEMPALACE_PYTHON points to %s but that file is not executable or does not exist.\n' "$MEMPALACE_PYTHON" >&2
  printf 'Run ./setup.sh to create the venv, or fix the path.\n' >&2
  exit 1
fi

exec "$MEMPALACE_PYTHON" -m mempalace.mcp_server "$@"
