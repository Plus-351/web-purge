#!/usr/bin/env bash
set -euo pipefail

# Dev launcher for Chrome/Edge that loads the unpacked extension into
# a temporary profile to avoid touching your main browser profile.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_PATH="$ROOT"
PROFILE_DIR="$EXT_PATH/.tmp-chrome-profile"

CHROME_BIN="${CHROME_BIN:-/snap/bin/chromium}"
if [ -z "$CHROME_BIN" ]; then
  if command -v google-chrome >/dev/null 2>&1; then CHROME_BIN="$(command -v google-chrome)"; fi
  if [ -z "$CHROME_BIN" ] && command -v google-chrome-stable >/dev/null 2>&1; then CHROME_BIN="$(command -v google-chrome-stable)"; fi
  if [ -z "$CHROME_BIN" ] && command -v chromium >/dev/null 2>&1; then CHROME_BIN="$(command -v chromium)"; fi
  if [ -z "$CHROME_BIN" ] && command -v chromium-browser >/dev/null 2>&1; then CHROME_BIN="$(command -v chromium-browser)"; fi
fi

EDGE_BIN="${EDGE_BIN:-}"
if [ -z "$EDGE_BIN" ]; then
  if command -v microsoft-edge >/dev/null 2>&1; then EDGE_BIN="$(command -v microsoft-edge)"; fi
fi

usage() {
  cat <<EOF
Usage: $0 [chrome|edge]

Defaults to 'chrome'.
Environment variables:
  CHROME_BIN - path to Chrome/Chromium executable
  EDGE_BIN   - path to Edge executable

This script creates a temporary profile directory at:
  $PROFILE_DIR
and launches the browser loading the unpacked extension from the repository root.
EOF
  exit 1
}

MODE="${1:-chrome}"

if [ "$MODE" = "edge" ]; then
  if [ -z "$EDGE_BIN" ]; then
    echo "Microsoft Edge binary not found. Set EDGE_BIN or install Edge." >&2
    exit 2
  fi
  exec "$EDGE_BIN" \
    --user-data-dir="$PROFILE_DIR-edge" \
    --no-first-run \
    --disable-sync \
    --disable-extensions-except="$EXT_PATH" \
    --load-extension="$EXT_PATH"
else
  if [ -z "$CHROME_BIN" ]; then
    echo "Chrome/Chromium binary not found. Set CHROME_BIN or install Chrome/Chromium." >&2
    exit 2
  fi
  # Allow optional window size via env var WINDOW_SIZE e.g. "1200,900"
  WINDOW_SIZE="${WINDOW_SIZE:-}"
  if [ -n "$WINDOW_SIZE" ]; then
    # expect WIDTH,HEIGHT
    WIDTH=$(echo "$WINDOW_SIZE" | cut -d',' -f1)
    HEIGHT=$(echo "$WINDOW_SIZE" | cut -d',' -f2)
    if [ -n "$WIDTH" ] && [ -n "$HEIGHT" ]; then
      # allow setting language via CHROME_LANG (e.g. en-US, pt-BR)
      CHROME_LANG_ARG=""
      if [ -n "${CHROME_LANG:-}" ]; then
        CHROME_LANG_ARG="--lang=${CHROME_LANG} --accept-lang=${CHROME_LANG}"
      fi
      exec "$CHROME_BIN" \
        --user-data-dir="$PROFILE_DIR" \
        --no-first-run \
        --disable-sync \
        --disable-extensions-except="$EXT_PATH" \
        --load-extension="$EXT_PATH" \
        $CHROME_LANG_ARG \
        --window-size=$WIDTH,$HEIGHT
    fi
  fi
  CHROME_LANG_ARG=""
  if [ -n "${CHROME_LANG:-}" ]; then
    CHROME_LANG_ARG="--lang=${CHROME_LANG} --accept-lang=${CHROME_LANG}"
  fi
  exec "$CHROME_BIN" \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --disable-sync \
    --disable-extensions-except="$EXT_PATH" \
    --load-extension="$EXT_PATH" \
    $CHROME_LANG_ARG
fi
