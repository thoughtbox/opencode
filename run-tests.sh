#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(dirname "$0")

node "$SCRIPT_DIR/tests/test-mempalace-autosave-plugin.mjs"
python3 -m unittest "$SCRIPT_DIR/tests/test_mempalace_autosave_sync.py"
