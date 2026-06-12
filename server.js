import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { distroProfiles, installModules, moduleSteps, sudoModules, vmTestSuites } from "./manifests/linux.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4177);

let clients = new Set();
let currentRun = null;

const getGeneratedDir = () => process.env.ENV_SETUP_CENTER_DATA_DIR || path.join(__dirname, "generated");

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const sendEvent = (event, data) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) client.write(payload);
};

const commandExists = (command) =>
  new Promise((resolve) => {
    execFile("bash", ["-lc", `command -v ${command} >/dev/null 2>&1`], (error) => resolve(!error));
  });

const shellOutput = (command) =>
  new Promise((resolve) => {
    execFile("bash", ["-lc", command], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      const lines = stdout.trim().split("\n").filter(Boolean);
      resolve(lines.slice(0, 3).join("\n"));
    });
  });

const statusChecks = [
  ["git", "git --version | head -n 1"],
  ["curl", "curl --version | head -n 1"],
  ["brew", "brew --version | head -n 1"],
  ["node", "node --version"],
  ["java", "java -version 2>&1 | head -n 1"],
  ["php", "php --version | head -n 1"],
  ["composer", "composer --version"],
  ["mysql", "mysql --version"],
  ["psql", "psql --version"],
  ["watchman", "watchman --version"],
  ["flutter", "flutter --version | head -n 1"],
  ["gh", "gh --version | head -n 1"],
  ["gcloud", "gcloud --version | head -n 1"],
  ["aws", "aws --version"],
  ["op", "op --version"],
  ["codex", "codex --version"],
  ["codex-desktop", "codex-desktop-version 2>/dev/null | sed -n '1,3p' || codex-desktop --version 2>/dev/null || true"],
  ["docker", "docker --version"],
  ["kubectl", "kubectl version --client=true --short 2>/dev/null || kubectl version --client=true 2>/dev/null | head -n 1"],
  ["helm", "helm version --short"],
  ["terraform", "terraform version | head -n 1"],
  ["az", "az version --output tsv --query '\"azure-cli\"' 2>/dev/null || az --version | head -n 1"],
  ["code", "code --version | head -n 1"]
];

const getStatus = async () => {
  const checks = {};
  await Promise.all(
    statusChecks.map(async ([command, versionCommand]) => {
      const installed = await commandExists(command);
      checks[command] = {
        installed,
        version: installed ? await shellOutput(versionCommand) : ""
      };
    })
  );
  checks.androidStudio = {
    installed: (await shellOutput("snap list android-studio 2>/dev/null | tail -n +2")).length > 0,
    version: await shellOutput("snap list android-studio 2>/dev/null | awk 'NR==2 {print $2}'")
  };
  checks.dbeaver = {
    installed: (await shellOutput("flatpak info io.dbeaver.DBeaverCommunity 2>/dev/null | head -n 1")).length > 0,
    version: await shellOutput("flatpak info io.dbeaver.DBeaverCommunity 2>/dev/null | awk -F': ' '/Version/ {print $2; exit}'")
  };
  checks.os = await shellOutput(". /etc/os-release && printf '%s' \"$PRETTY_NAME\"");
  checks.home = os.homedir();
  return checks;
};

const q = (value) => JSON.stringify(String(value ?? ""));

const section = (title, lines) => [
  "",
  `log ${q(title)}`,
  ...lines,
  ""
].join("\n");

const dynamicModuleSteps = {
  flutter: ({ flutterDir }) => [
    `FLUTTER_DIR=${q(flutterDir)}`,
    "mkdir -p \"$(dirname \"$FLUTTER_DIR\")\"",
    "if [[ -d \"$FLUTTER_DIR/.git\" ]]; then git -C \"$FLUTTER_DIR\" fetch --depth=1 origin stable && git -C \"$FLUTTER_DIR\" checkout stable && git -C \"$FLUTTER_DIR\" pull --ff-only; else git clone --depth=1 --branch stable https://github.com/flutter/flutter.git \"$FLUTTER_DIR\"; fi"
  ],
  "codex-desktop": ({ codexMode, codexRepo }) => [
    `CODEX_DESKTOP_REPO_DIR=${q(codexRepo)}`,
    `CODEX_DESKTOP_INSTALL_MODE=${q(codexMode)}`,
    "if [[ ! -d \"$CODEX_DESKTOP_REPO_DIR/.git\" ]]; then git clone https://github.com/ilysenko/codex-desktop-linux.git \"$CODEX_DESKTOP_REPO_DIR\"; fi",
    "case \"$CODEX_DESKTOP_INSTALL_MODE\" in",
    "  auto)",
    "    deb=\"$(latest_file \"$CODEX_DESKTOP_REPO_DIR/dist/codex-desktop_*.deb\" || true)\"",
    "    if have codex-desktop; then echo \"codex-desktop already installed\"; elif [[ -n \"$deb\" && \"$DISTRO_ID\" =~ ^(ubuntu|debian)$ ]]; then apt_install \"$deb\"; else make -C \"$CODEX_DESKTOP_REPO_DIR\" install-user-app; fi",
    "    ;;",
    "  deb) [[ \"$DISTRO_ID\" =~ ^(ubuntu|debian)$ ]] || { echo '.deb mode only works on Debian/Ubuntu profiles.' >&2; exit 1; }; deb=\"$(latest_file \"$CODEX_DESKTOP_REPO_DIR/dist/codex-desktop_*.deb\" || true)\"; [[ -n \"$deb\" ]] || { echo \"No local .deb found\" >&2; exit 1; }; apt_install \"$deb\" ;;",
    "  user) make -C \"$CODEX_DESKTOP_REPO_DIR\" install-user-app ;;",
    "  native) make -C \"$CODEX_DESKTOP_REPO_DIR\" bootstrap-native ;;",
    "esac"
  ],
  "shell-setup": ({ androidHome, flutterDir }) => [
    `ANDROID_HOME_DIR=${q(androidHome)}`,
    `FLUTTER_DIR=${q(flutterDir)}`,
    "MARKER_START='# >>> dev-workstation bootstrap >>>'",
    "MARKER_END='# <<< dev-workstation bootstrap <<<'",
    "if ! grep -Fq \"$MARKER_START\" \"$HOME/.bashrc\"; then",
    "cat >>\"$HOME/.bashrc\" <<EOF",
    "",
    "$MARKER_START",
    "if command -v brew >/dev/null 2>&1; then",
    "  export HOMEBREW_PREFIX=\"$(brew --prefix)\"",
    "  export PATH=\"$HOMEBREW_PREFIX/bin:$HOMEBREW_PREFIX/sbin:$HOME/.local/bin:$PATH\"",
    "  export JAVA_HOME=\"$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home\"",
    "  export PATH=\"$JAVA_HOME/bin:$PATH\"",
    "fi",
    "export ANDROID_HOME=\"$ANDROID_HOME_DIR\"",
    "export ANDROID_SDK_ROOT=\"$ANDROID_HOME\"",
    "export PATH=\"$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH\"",
    "export FLUTTER_HOME=\"$FLUTTER_DIR\"",
    "export PATH=\"$FLUTTER_HOME/bin:$PATH\"",
    "eval \"$(direnv hook bash)\"",
    "$MARKER_END",
    "EOF",
    "fi"
  ]
};

const renderModuleSteps = (moduleId, context) => {
  if (dynamicModuleSteps[moduleId]) return dynamicModuleSteps[moduleId](context);
  return moduleSteps[moduleId] || [];
};

const generateScript = (config = {}) => {
  const selected = new Set(config.selected || []);
  const services = Boolean(config.startServices);
  const targetDistro = config.distroProfile || "auto";
  const codexMode = config.codexDesktopMode || "auto";
  const codexRepo = config.codexDesktopRepo || "$HOME/codex-desktop-linux";
  const flutterDir = config.flutterDir || "$HOME/develop/flutter";
  const androidHome = config.androidHome || "$HOME/Android/Sdk";
  const gitName = (config.gitName || "").trim();
  const gitEmail = (config.gitEmail || "").trim();

  const blocks = [];
  const wants = (...ids) => ids.some((id) => selected.has(id));
  const needsSudo = [...selected].some((moduleId) => sudoModules.includes(moduleId));

  if (needsSudo) {
    blocks.push(section("Checking sudo access", [
      "if ! sudo -n true 2>/dev/null; then",
      "  if [[ -t 0 ]]; then",
      "    sudo -v",
      "  else",
      "    echo 'This selected setup needs sudo. Run it from a terminal so sudo can prompt.' >&2",
      "    exit 2",
      "  fi",
      "fi",
      "if sudo -n true 2>/dev/null; then",
      "  while true; do sudo -n true 2>/dev/null || exit; sleep 60; done &",
      "  SUDO_KEEPALIVE_PID=$!",
      "  trap 'kill \"$SUDO_KEEPALIVE_PID\" 2>/dev/null || true' EXIT",
      "fi"
    ]));
  }

  const context = { androidHome, codexMode, codexRepo, flutterDir };
  for (const module of installModules) {
    if (!wants(module.id)) continue;
    const steps = renderModuleSteps(module.id, context);
    if (steps.length) blocks.push(section(module.scriptTitle || module.title, steps));
  }

  if (gitName || gitEmail) {
    blocks.push(section("Configuring Git identity", [
      gitName ? `git config --global user.name ${q(gitName)}` : ":",
      gitEmail ? `git config --global user.email ${q(gitEmail)}` : ":"
    ]));
  }

  if (services) {
    blocks.push(section("Starting database services", [
      "brew services start mysql || true",
      "brew services start postgresql || true"
    ]));
  }

  const authHints = [
    "# Post-install sign-ins:",
    "#   gh auth login",
    "#   gcloud init",
    "#   aws configure",
    "#   op account add",
    "#   codex",
    "#   flutter doctor --android-licenses",
    "#   flutter doctor"
  ].join("\n");

  return `#!/usr/bin/env bash
set -euo pipefail
TARGET_DISTRO=${q(targetDistro)}

log() { printf '\\n\\033[1;36m==>\\033[0m %s\\n' "$*"; }
warn() { printf '\\n\\033[1;33mWARN:\\033[0m %s\\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

detect_distro() {
  local id="" like="" requested="$TARGET_DISTRO"
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    id="\${ID:-}"
    like="\${ID_LIKE:-}"
  fi
  if [[ -n "$requested" && "$requested" != "auto" ]]; then
    printf '%s\\n' "$requested"
    return
  fi
  case " $id $like " in
    *manjaro*) printf 'manjaro\\n' ;;
    *arch*) printf 'arch\\n' ;;
    *fedora*) printf 'fedora\\n' ;;
    *ubuntu*|*debian*) printf 'ubuntu\\n' ;;
    *) printf '%s\\n' "\${id:-unknown}" ;;
  esac
}

DISTRO_ID="$(detect_distro)"
log "Target distro profile: $DISTRO_ID"

APT_UPDATED=0
PACMAN_UPDATED=0

apt_refresh() {
  if [[ "$APT_UPDATED" -eq 0 ]]; then
    sudo apt-get update
    APT_UPDATED=1
  fi
}

apt_install() {
  apt_refresh
  sudo apt-get install -y "$@"
}

dnf_install() {
  sudo dnf install -y "$@"
}

pacman_refresh() {
  if [[ "$PACMAN_UPDATED" -eq 0 ]]; then
    sudo pacman -Syu --noconfirm
    PACMAN_UPDATED=1
  fi
}

pacman_install() {
  pacman_refresh
  sudo pacman -S --needed --noconfirm "$@"
}

ensure_flatpak() {
  if ! have flatpak; then
    case "$DISTRO_ID" in
      ubuntu|debian) apt_install flatpak ;;
      fedora) dnf_install flatpak ;;
      arch|manjaro) pacman_install flatpak ;;
      *) warn "No Flatpak install mapping for $DISTRO_ID" ;;
    esac
  fi
  if have flatpak; then
    sudo flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
  fi
}

flatpak_install() {
  local ref="$1"
  ensure_flatpak
  if flatpak info "$ref" >/dev/null 2>&1; then
    echo "flatpak already installed: $ref"
  else
    flatpak install -y --system flathub "$ref"
  fi
}

flatpak_install_optional() {
  local ref="$1"
  flatpak_install "$ref" || warn "Could not install optional Flatpak: $ref"
}

install_base_tools() {
  case "$DISTRO_ID" in
    ubuntu|debian)
      apt_install apt-transport-https android-tools-adb android-tools-fastboot build-essential ca-certificates clang cmake curl direnv file flatpak g++ gcc git gnupg jq libfuse2t64 libgtk-3-dev liblzma-dev lsb-release make ninja-build openssh-client pkg-config procps python3 python3-pip python3-venv pipx remmina rsync snapd unzip wget xz-utils zip
      ;;
    fedora)
      sudo dnf groupinstall -y "Development Tools" || true
      dnf_install android-tools ca-certificates clang cmake curl direnv file flatpak gcc gcc-c++ git gnupg2 jq fuse gtk3-devel xz-devel redhat-lsb-core make ninja-build openssh-clients pkgconf-pkg-config procps-ng python3 python3-pip pipx remmina rsync unzip wget xz zip which
      ;;
    arch|manjaro)
      pacman_install base-devel android-tools ca-certificates clang cmake curl direnv file flatpak gcc git gnupg jq fuse2 gtk3 xz lsb-release make ninja openssh pkgconf procps-ng python python-pip python-pipx remmina rsync unzip wget zip which
      ;;
    *)
      echo "Unsupported distro profile for base tools: $DISTRO_ID" >&2
      exit 1
      ;;
  esac
  ensure_flatpak
  if have python3; then python3 -m pipx ensurepath || true; elif have python; then python -m pipx ensurepath || true; fi
}

ensure_homebrew() {
  if [[ -x /home/linuxbrew/.linuxbrew/bin/brew ]]; then
    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
  elif [[ -x "$HOME/.linuxbrew/bin/brew" ]]; then
    eval "$("$HOME/.linuxbrew/bin/brew" shellenv)"
  elif have brew; then
    eval "$(brew shellenv)"
  else
    sudo -v
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [[ -x /home/linuxbrew/.linuxbrew/bin/brew ]]; then
      eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
    elif [[ -x "$HOME/.linuxbrew/bin/brew" ]]; then
      eval "$("$HOME/.linuxbrew/bin/brew" shellenv)"
    fi
  fi
}

brew_install() {
  ensure_homebrew
  brew install "$@"
}

install_desktop_apps() {
  ensure_flatpak
  flatpak_install com.google.AndroidStudio
  flatpak_install com.slack.Slack
  flatpak_install com.getpostman.Postman
  flatpak_install_optional com.termius.Termius
  flatpak_install org.remmina.Remmina
  flatpak_install io.dbeaver.DBeaverCommunity
}

install_chrome() {
  if have google-chrome || have google-chrome-stable; then
    echo "Google Chrome already installed"
    return
  fi
  case "$DISTRO_ID" in
    ubuntu|debian)
      wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor | sudo tee /etc/apt/keyrings/google-chrome.gpg >/dev/null
      echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main' | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null
      APT_UPDATED=0
      apt_install google-chrome-stable
      ;;
    fedora)
      sudo tee /etc/yum.repos.d/google-chrome.repo >/dev/null <<'EOF'
[google-chrome]
name=google-chrome
baseurl=https://dl.google.com/linux/chrome/rpm/stable/x86_64
enabled=1
gpgcheck=1
gpgkey=https://dl.google.com/linux/linux_signing_key.pub
EOF
      dnf_install google-chrome-stable
      ;;
    arch|manjaro)
      if have yay; then
        yay -S --needed --noconfirm google-chrome
      elif have pamac; then
        pamac build --no-confirm google-chrome
      else
        warn "No AUR helper found for Google Chrome; installing Chromium instead."
        pacman_install chromium
      fi
      ;;
  esac
}

install_vscode() {
  if have code; then
    echo "VS Code already installed"
    return
  fi
  case "$DISTRO_ID" in
    ubuntu|debian)
      wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | sudo tee /etc/apt/keyrings/packages.microsoft.gpg >/dev/null
      echo 'deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main' | sudo tee /etc/apt/sources.list.d/vscode.list >/dev/null
      APT_UPDATED=0
      apt_install code
      ;;
    fedora)
      sudo rpm --import https://packages.microsoft.com/keys/microsoft.asc
      sudo tee /etc/yum.repos.d/vscode.repo >/dev/null <<'EOF'
[code]
name=Visual Studio Code
baseurl=https://packages.microsoft.com/yumrepos/vscode
enabled=1
gpgcheck=1
gpgkey=https://packages.microsoft.com/keys/microsoft.asc
EOF
      dnf_install code
      ;;
    arch|manjaro)
      if have yay; then yay -S --needed --noconfirm visual-studio-code-bin || pacman_install code; else pacman_install code; fi
      ;;
  esac
}

install_github_cli() {
  if have gh; then echo "GitHub CLI already installed"; else brew_install gh; fi
}

install_cloud_clis() {
  brew_install google-cloud-sdk awscli
}

install_onepassword_cli() {
  if have op; then
    echo "1Password CLI already installed"
    return
  fi
  case "$DISTRO_ID" in
    ubuntu|debian)
      curl -sS https://downloads.1password.com/linux/keys/1password.asc | gpg --dearmor | sudo tee /usr/share/keyrings/1password-archive-keyring.gpg >/dev/null
      echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' | sudo tee /etc/apt/sources.list.d/1password.list >/dev/null
      sudo mkdir -p /etc/debsig/policies/AC2D62742012EA22/ /usr/share/debsig/keyrings/AC2D62742012EA22
      curl -sS https://downloads.1password.com/linux/debian/debsig/1password.pol | sudo tee /etc/debsig/policies/AC2D62742012EA22/1password.pol >/dev/null
      curl -sS https://downloads.1password.com/linux/keys/1password.asc | gpg --dearmor | sudo tee /usr/share/debsig/keyrings/AC2D62742012EA22/debsig.gpg >/dev/null
      APT_UPDATED=0
      apt_install 1password-cli
      ;;
    *)
      brew_install 1password-cli || warn "1Password CLI is not available through this profile. Install it manually if needed."
      ;;
  esac
}

install_docker() {
  if have docker; then
    echo "Docker already installed"
    return
  fi
  case "$DISTRO_ID" in
    ubuntu|debian)
      sudo install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      sudo chmod a+r /etc/apt/keyrings/docker.gpg
      # shellcheck disable=SC1091
      . /etc/os-release
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
      APT_UPDATED=0
      apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    fedora)
      dnf_install dnf-plugins-core
      sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
      dnf_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    arch|manjaro)
      pacman_install docker docker-compose
      ;;
  esac
  sudo systemctl enable --now docker || true
  sudo usermod -aG docker "$USER" || true
}

install_azure_cli() {
  if have az; then
    echo "Azure CLI already installed"
  elif [[ "$DISTRO_ID" =~ ^(ubuntu|debian)$ ]]; then
    curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
  else
    brew_install azure-cli
  fi
}
latest_file() {
  local pattern="$1" matches
  matches="$(compgen -G "$pattern" || true)"
  [[ -n "$matches" ]] || return 1
  printf '%s\\n' "$matches" | sort -V | tail -n 1
}

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Do not run this script as root. It uses sudo where needed." >&2
  exit 1
fi

${blocks.join("\n")}

${authHints}

log "Selected setup complete"
`;
};

const launchTerminal = (command) =>
  new Promise((resolve, reject) => {
    const terminal = process.env.TERMINAL || "x-terminal-emulator";
    const child = spawn(terminal, ["-e", "bash", "-lc", `${command}; echo; read -rp 'Press Enter to close...'`], {
      detached: true,
      stdio: "ignore"
    });
    child.on("error", reject);
    child.unref();
    resolve();
  });

const saveGeneratedScript = async (config) => {
  const generatedDir = getGeneratedDir();
  await mkdir(generatedDir, { recursive: true });
  const script = generateScript(config);
  const file = path.join(generatedDir, "selected-bootstrap.sh");
  await writeFile(file, script, { mode: 0o755 });
  return { file, script };
};

const serveStatic = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(publicDir, rawPath));
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  res.writeHead(200, { "content-type": contentTypes[ext] || "application/octet-stream" });
  res.end(await readFile(filePath));
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/manifest" && req.method === "GET") {
      return json(res, 200, { distroProfiles, modules: installModules, vmTestSuites });
    }
    if (url.pathname === "/api/status" && req.method === "GET") {
      return json(res, 200, await getStatus());
    }
    if (url.pathname === "/api/generate" && req.method === "POST") {
      return json(res, 200, { script: generateScript(await readBody(req)) });
    }
    if (url.pathname === "/api/save" && req.method === "POST") {
      return json(res, 200, await saveGeneratedScript(await readBody(req)));
    }
    if (url.pathname === "/api/open-terminal" && req.method === "POST") {
      const { file } = await saveGeneratedScript(await readBody(req));
      await launchTerminal(`bash ${JSON.stringify(file)}`);
      return json(res, 200, { ok: true, file });
    }
    if (url.pathname === "/api/auth" && req.method === "POST") {
      const body = await readBody(req);
      const commands = {
        sudo: "sudo -v && echo 'Sudo unlocked for this login session.'",
        github: "gh auth login",
        gcloud: "gcloud init",
        aws: "aws configure",
        onepassword: "op account add",
        codex: "codex",
        flutter: "flutter doctor --android-licenses && flutter doctor"
      };
      const command = commands[body.target];
      if (!command) return json(res, 400, { error: "Unknown auth target" });
      await launchTerminal(command);
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/api/events" && req.method === "GET") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      res.write("\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    return serveStatic(req, res);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

export const startServer = ({ host = "127.0.0.1", port: listenPort = port } = {}) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : listenPort;
      resolve({ server, url: `http://${host}:${actualPort}` });
    });
  });

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startServer().then(({ url }) => {
    console.log(`Env Setup Center running at ${url}`);
  });
}
