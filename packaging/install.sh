#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p "$HOME/.local/bin" "$HOME/.config/systemd/user"
ln -sf "$here/bin/omarchy-assistant" "$HOME/.local/bin/omarchy-assistant"
cp "$here/packaging/omarchy-assistant.service" "$HOME/.config/systemd/user/"

systemctl --user daemon-reload
systemctl --user enable --now omarchy-assistant.service

echo "Installed."
echo "  binary:  $HOME/.local/bin/omarchy-assistant"
echo "  service: omarchy-assistant.service ($(systemctl --user is-active omarchy-assistant.service))"
echo "  binding: add  o.bind(\"SUPER + SHIFT + A\", \"Ask QWEEPS\", \"omarchy-assistant summon\")"
echo "           to ~/.config/hypr/bindings.lua, then: hyprctl reload"
