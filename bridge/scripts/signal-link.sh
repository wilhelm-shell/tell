#!/bin/sh
# One-time linking of this container's signal-cli as a SECONDARY device.
# Scan the QR code with the Signal app on the primary phone
# (Settings -> Linked devices -> Link new device).
#
# signal-cli prints the sgnl:// URI, then keeps stdout open until the
# link completes, so we cannot pipe the whole stream into qrencode
# (it would wait for EOF). Render line by line instead.
set -eu

NAME="${1:-tell}"

signal-cli --data-dir "$SIGNAL_CLI_DATA_DIR" link -n "$NAME" | while IFS= read -r line; do
  case "$line" in
    sgnl://*)
      printf '%s\n\n' "$line"
      printf '%s' "$line" | qrencode -t ANSIUTF8
      ;;
    *)
      printf '%s\n' "$line"
      ;;
  esac
done
