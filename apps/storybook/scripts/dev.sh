#!/bin/sh
set -eu

TAILSCALE_IP=""
if command -v tailscale >/dev/null 2>&1; then
  TAILSCALE_IP="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
fi

if [ -n "$TAILSCALE_IP" ]; then
  echo "Storybook en Tailscale: http://$TAILSCALE_IP:6006/"
else
  echo "Tailscale no disponible."
fi

exec storybook dev -p 6006 --exact-port --host 0.0.0.0
