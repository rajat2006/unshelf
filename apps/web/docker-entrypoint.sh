#!/bin/sh
set -eu

discover_enabled="${DISCOVER_ENABLED:-false}"
case "$discover_enabled" in
  true|false) ;;
  *)
    echo "DISCOVER_ENABLED must be true or false" >&2
    exit 2
    ;;
esac

web_root="${UNSHELF_WEB_ROOT:-/usr/share/caddy}"
printf 'globalThis.__UNSHELF_RUNTIME_CONFIG__ = Object.freeze({ discoverEnabled: %s });\n' \
  "$discover_enabled" > "$web_root/runtime-config.js"

if [ "${UNSHELF_RUNTIME_CONFIG_ONLY:-false}" = "true" ]; then
  exit 0
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
