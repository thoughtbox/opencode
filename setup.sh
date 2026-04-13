#!/usr/bin/env sh

set -eu

VENV_DIR="${MEMPALACE_VENV_DIR:-$HOME/.venvs/mempalace}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
ENV_FILE="${ENV_FILE:-.env.local}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  printf 'error: %s was not found in PATH\n' "$PYTHON_BIN" >&2
  exit 1
fi

# Try python3 -m venv first; fall back to virtualenv if the venv module
# is missing (common on Debian/Ubuntu without python3-venv installed).
if "$PYTHON_BIN" -m venv "$VENV_DIR" 2>/dev/null; then
  :
elif command -v virtualenv >/dev/null 2>&1; then
  virtualenv -p "$PYTHON_BIN" "$VENV_DIR"
else
  printf 'error: neither "python3 -m venv" nor "virtualenv" worked.\n' >&2
  printf 'Install one of:\n' >&2
  printf '  apt install python3-venv   (Debian/Ubuntu)\n' >&2
  printf '  pip install virtualenv\n' >&2
  exit 1
fi

# Detect the correct venv binary path for this OS.
# Unix venvs use bin/python; Windows venvs use Scripts/python.exe.
if [ -x "$VENV_DIR/bin/python" ]; then
  MEMPALACE_PYTHON="$VENV_DIR/bin/python"
elif [ -x "$VENV_DIR/Scripts/python.exe" ]; then
  MEMPALACE_PYTHON="$VENV_DIR/Scripts/python.exe"
elif [ -x "$VENV_DIR/Scripts/python" ]; then
  MEMPALACE_PYTHON="$VENV_DIR/Scripts/python"
else
  printf 'error: could not find python in the created venv at %s\n' "$VENV_DIR" >&2
  printf 'Expected bin/python (Unix) or Scripts/python.exe (Windows).\n' >&2
  exit 1
fi

# Use a local temp directory for pip builds.
# ChromaDB compiles C++ from source (chroma-hnswlib) and needs scratch space.
# Systems with a small /tmp (tmpfs) can run out of space during compilation.
BUILD_TMPDIR="$(pwd)/.pip-build-tmp"
mkdir -p "$BUILD_TMPDIR"
cleanup_tmpdir() { rm -rf "$BUILD_TMPDIR"; }
trap cleanup_tmpdir EXIT

TMPDIR="$BUILD_TMPDIR" "$MEMPALACE_PYTHON" -m pip install --upgrade pip
TMPDIR="$BUILD_TMPDIR" "$MEMPALACE_PYTHON" -m pip install --upgrade mempalace

# Write .env.local with the resolved path.
# Using printf to avoid expansion issues with heredoc on paths
# containing dollar signs or double quotes.
printf 'export MEMPALACE_PYTHON="%s"\n' "$MEMPALACE_PYTHON" > "$ENV_FILE"

export MEMPALACE_PYTHON="$MEMPALACE_PYTHON"

printf 'MemPalace installed at %s\n' "$MEMPALACE_PYTHON"
printf 'Wrote %s\n' "$ENV_FILE"
printf 'Current shell export: MEMPALACE_PYTHON=%s\n' "$MEMPALACE_PYTHON"
printf '\n'
printf 'If you ran this as ./setup.sh, load the variable with:\n'
printf '  . ./%s\n' "$ENV_FILE"
printf '\n'
printf 'Then start OpenCode with:\n'
printf '  opencode\n'
