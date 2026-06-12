#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPIMAGE_SOURCE="$ROOT_DIR/dist/Environment Setup Center-0.2.2-x86_64.AppImage"
INSTALL_DIR="$HOME/.local/opt/env-setup-center"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

if [[ ! -f "$APPIMAGE_SOURCE" ]]; then
  echo "Missing AppImage: $APPIMAGE_SOURCE" >&2
  exit 1
fi

if ! ldconfig -p 2>/dev/null | grep -q 'libfuse.so.2'; then
  echo "Installing AppImage FUSE runtime: libfuse2t64"
  sudo apt-get update
  sudo apt-get install -y libfuse2t64
fi

mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR"
cp "$APPIMAGE_SOURCE" "$INSTALL_DIR/env-setup-center.AppImage"
chmod +x "$INSTALL_DIR/env-setup-center.AppImage"
cp "$ROOT_DIR/assets/icon.png" "$ICON_DIR/env-setup-center.png"

cat >"$BIN_DIR/env-setup-center" <<EOF
#!/usr/bin/env bash
exec "$INSTALL_DIR/env-setup-center.AppImage" "\$@"
EOF
chmod +x "$BIN_DIR/env-setup-center"

cat >"$DESKTOP_DIR/env-setup-center.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Environment Setup Center
Comment=Configure and install the local development environment
Exec=$BIN_DIR/env-setup-center
Icon=env-setup-center
Terminal=false
Categories=Development;Settings;
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi

echo "Installed Environment Setup Center."
echo "Run: env-setup-center"
