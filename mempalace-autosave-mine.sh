#!/usr/bin/env sh

set -eu

AUTOSAVE_DIR="${1:-${MEMPALACE_AUTOSAVE_DIR:-.mempalace-autosave}}"
SCRIPT_DIR="$(dirname "$0")"
WING_NAME="$(basename "$SCRIPT_DIR")"

if [ -z "${MEMPALACE_PYTHON:-}" ]; then
  printf 'error: MEMPALACE_PYTHON is not set.\n' >&2
  exit 1
fi

if [ ! -x "$MEMPALACE_PYTHON" ]; then
  printf 'error: MEMPALACE_PYTHON points to %s but that file is not executable or does not exist.\n' "$MEMPALACE_PYTHON" >&2
  exit 1
fi

if [ ! -d "$AUTOSAVE_DIR" ]; then
  printf 'error: autosave directory %s does not exist.\n' "$AUTOSAVE_DIR" >&2
  exit 1
fi

exec "$MEMPALACE_PYTHON" "$SCRIPT_DIR/mempalace-autosave-sync.py" "$AUTOSAVE_DIR/sessions" --wing "$WING_NAME"
