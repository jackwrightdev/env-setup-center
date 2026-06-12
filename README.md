# Environment Setup Center

A local GUI for setting up an Ubuntu developer workstation.

## Run

```bash
cd /home/jack-wright/Documents/Codex/2026-06-11/take-a-look-at-our-os/outputs/env-setup-center
npm start
```

Open:

```text
http://127.0.0.1:4177
```

## What It Does

- Detects installed tools and desktop apps.
- Lets you choose install modules instead of running one huge script.
- Generates a selected bootstrap script at `generated/selected-bootstrap.sh`.
- Opens the generated script in a terminal so `sudo` prompts work normally.
- Opens auth/config flows for `gh`, `gcloud`, `aws`, `op`, `codex`, and Flutter Android licenses.
- Does not store passwords, tokens, API keys, or cloud secrets.

## Notes

- Terminal mode is the best way to run first-time installs because `sudo` and login prompts need a real terminal.
- Inline mode is useful for already-authenticated, non-interactive sections.
- Codex Desktop defaults to your local `~/codex-desktop-linux` wrapper and prefers an existing local `.deb`.

## Package

Build an AppImage:

```bash
npm run dist:appimage
```

Build a Debian package:

```bash
npm run dist:deb
```

Current artifacts:

- `dist/Environment Setup Center-0.1.1-x86_64.AppImage`
- `dist/Environment Setup Center-0.1.1-amd64.deb`

When using the public GitHub repo, download packaged binaries from the Releases page rather than from git history.

Ubuntu 26.04 needs the AppImage FUSE 2 runtime:

```bash
sudo apt install libfuse2t64
```

To install the AppImage into `~/.local/opt`, add a launcher in `~/.local/bin`, and create an app-menu entry:

```bash
./install-appimage-local.sh
```

Install the Debian package directly:

```bash
sudo apt install ./dist/Environment\ Setup\ Center-0.1.1-amd64.deb
```
