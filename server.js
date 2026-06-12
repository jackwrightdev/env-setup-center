import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

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

const generateScript = (config = {}) => {
  const selected = new Set(config.selected || []);
  const services = Boolean(config.startServices);
  const codexMode = config.codexDesktopMode || "auto";
  const codexRepo = config.codexDesktopRepo || "$HOME/codex-desktop-linux";
  const flutterDir = config.flutterDir || "$HOME/develop/flutter";
  const androidHome = config.androidHome || "$HOME/Android/Sdk";
  const gitName = (config.gitName || "").trim();
  const gitEmail = (config.gitEmail || "").trim();

  const blocks = [];
  const wants = (...ids) => ids.some((id) => selected.has(id));

  if (wants("base")) {
    blocks.push(section("Installing base Ubuntu tools", [
      "sudo apt-get update",
      "apt_install apt-transport-https android-tools-adb android-tools-fastboot build-essential ca-certificates clang cmake curl direnv file flatpak g++ gcc git gnupg jq libfuse2t64 libgtk-3-dev liblzma-dev lsb-release make ninja-build openssh-client pkg-config procps python3 python3-pip python3-venv pipx remmina rsync snapd unzip wget xz-utils zip",
      "sudo flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo",
      "python3 -m pipx ensurepath || true"
    ]));
  }

  if (wants("brew", "brew-packages")) {
    blocks.push(section("Installing Homebrew for Linux", [
      "if ! have brew; then NONINTERACTIVE=1 /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"; fi",
      "eval \"$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)\"",
      "brew update"
    ]));
  }

  if (wants("brew-packages")) {
    blocks.push(section("Installing Brew runtimes and services", [
      "brew install composer gcc mysql node openjdk@17 php postgresql watchman",
      "npm install -g corepack npm-check-updates",
      "corepack enable || true"
    ]));
  }

  if (wants("desktop-apps")) {
    blocks.push(section("Installing desktop apps", [
      "snap_install android-studio --classic",
      "snap_install slack --classic",
      "snap_install postman",
      "snap_install termius-app",
      "apt_install remmina",
      "flatpak_install io.dbeaver.DBeaverCommunity"
    ]));
  }

  if (wants("chrome")) {
    blocks.push(section("Installing Google Chrome", [
      "if ! have google-chrome; then",
      "  wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor | sudo tee /etc/apt/keyrings/google-chrome.gpg >/dev/null",
      "  echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main' | sudo tee /etc/apt/sources.list.d/google-chrome.list >/dev/null",
      "  sudo apt-get update",
      "  apt_install google-chrome-stable",
      "fi"
    ]));
  }

  if (wants("vscode")) {
    blocks.push(section("Installing Visual Studio Code", [
      "if ! have code; then",
      "  wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | sudo tee /etc/apt/keyrings/packages.microsoft.gpg >/dev/null",
      "  echo 'deb [arch=amd64,arm64,armhf signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main' | sudo tee /etc/apt/sources.list.d/vscode.list >/dev/null",
      "  sudo apt-get update",
      "  apt_install code",
      "fi"
    ]));
  }

  if (wants("cloud-cli")) {
    blocks.push(section("Installing cloud CLIs", [
      "snap_install google-cloud-cli --classic",
      "snap_install aws-cli --classic"
    ]));
  }

  if (wants("github-cli")) {
    blocks.push(section("Installing GitHub CLI", [
      "if ! have gh; then",
      "  sudo mkdir -p -m 755 /etc/apt/keyrings",
      "  wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null",
      "  sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg",
      "  echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null",
      "  sudo apt-get update",
      "  apt_install gh",
      "fi"
    ]));
  }

  if (wants("onepassword")) {
    blocks.push(section("Installing 1Password CLI", [
      "if ! have op; then",
      "  curl -sS https://downloads.1password.com/linux/keys/1password.asc | gpg --dearmor | sudo tee /usr/share/keyrings/1password-archive-keyring.gpg >/dev/null",
      "  echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' | sudo tee /etc/apt/sources.list.d/1password.list >/dev/null",
      "  sudo mkdir -p /etc/debsig/policies/AC2D62742012EA22/ /usr/share/debsig/keyrings/AC2D62742012EA22",
      "  curl -sS https://downloads.1password.com/linux/debian/debsig/1password.pol | sudo tee /etc/debsig/policies/AC2D62742012EA22/1password.pol >/dev/null",
      "  curl -sS https://downloads.1password.com/linux/keys/1password.asc | gpg --dearmor | sudo tee /usr/share/debsig/keyrings/AC2D62742012EA22/debsig.gpg >/dev/null",
      "  sudo apt-get update",
      "  apt_install 1password-cli",
      "fi"
    ]));
  }

  if (wants("flutter")) {
    blocks.push(section("Installing Flutter", [
      `FLUTTER_DIR=${q(flutterDir)}`,
      "mkdir -p \"$(dirname \"$FLUTTER_DIR\")\"",
      "if [[ -d \"$FLUTTER_DIR/.git\" ]]; then git -C \"$FLUTTER_DIR\" fetch --depth=1 origin stable && git -C \"$FLUTTER_DIR\" checkout stable && git -C \"$FLUTTER_DIR\" pull --ff-only; else git clone --depth=1 --branch stable https://github.com/flutter/flutter.git \"$FLUTTER_DIR\"; fi"
    ]));
  }

  if (wants("codex-cli")) {
    blocks.push(section("Installing Codex CLI", [
      "if ! have codex; then curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh; fi"
    ]));
  }

  if (wants("codex-desktop")) {
    blocks.push(section("Installing Codex Desktop Linux wrapper", [
      `CODEX_DESKTOP_REPO_DIR=${q(codexRepo)}`,
      `CODEX_DESKTOP_INSTALL_MODE=${q(codexMode)}`,
      "if [[ ! -d \"$CODEX_DESKTOP_REPO_DIR/.git\" ]]; then git clone https://github.com/ilysenko/codex-desktop-linux.git \"$CODEX_DESKTOP_REPO_DIR\"; fi",
      "case \"$CODEX_DESKTOP_INSTALL_MODE\" in",
      "  auto)",
      "    deb=\"$(latest_file \"$CODEX_DESKTOP_REPO_DIR/dist/codex-desktop_*.deb\" || true)\"",
      "    if [[ -n \"$deb\" ]]; then sudo apt-get install -y \"$deb\"; elif have codex-desktop; then echo \"codex-desktop already installed\"; else make -C \"$CODEX_DESKTOP_REPO_DIR\" install-user-app; fi",
      "    ;;",
      "  deb) deb=\"$(latest_file \"$CODEX_DESKTOP_REPO_DIR/dist/codex-desktop_*.deb\" || true)\"; [[ -n \"$deb\" ]] || { echo \"No local .deb found\" >&2; exit 1; }; sudo apt-get install -y \"$deb\" ;;",
      "  user) make -C \"$CODEX_DESKTOP_REPO_DIR\" install-user-app ;;",
      "  native) make -C \"$CODEX_DESKTOP_REPO_DIR\" bootstrap-native ;;",
      "esac"
    ]));
  }

  if (wants("docker")) {
    blocks.push(section("Installing Docker Engine", [
      "if ! have docker; then",
      "  sudo install -m 0755 -d /etc/apt/keyrings",
      "  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg",
      "  sudo chmod a+r /etc/apt/keyrings/docker.gpg",
      "  . /etc/os-release",
      "  echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable\" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null",
      "  sudo apt-get update",
      "  apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
      "  sudo usermod -aG docker \"$USER\"",
      "fi"
    ]));
  }

  if (wants("kubernetes")) {
    blocks.push(section("Installing Kubernetes tools", [
      "brew install kubectl helm"
    ]));
  }

  if (wants("terraform")) {
    blocks.push(section("Installing Terraform", [
      "brew install terraform"
    ]));
  }

  if (wants("azure")) {
    blocks.push(section("Installing Azure CLI", [
      "if ! have az; then curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash; fi"
    ]));
  }

  if (wants("mkcert")) {
    blocks.push(section("Installing mkcert", [
      "brew install mkcert nss",
      "mkcert -install"
    ]));
  }

  if (wants("shell-setup")) {
    blocks.push(section("Writing shell environment block", [
      `ANDROID_HOME_DIR=${q(androidHome)}`,
      `FLUTTER_DIR=${q(flutterDir)}`,
      "MARKER_START='# >>> dev-workstation bootstrap >>>'",
      "MARKER_END='# <<< dev-workstation bootstrap <<<'",
      "if ! grep -Fq \"$MARKER_START\" \"$HOME/.bashrc\"; then",
      "cat >>\"$HOME/.bashrc\" <<EOF",
      "",
      "$MARKER_START",
      "export HOMEBREW_PREFIX=\"/home/linuxbrew/.linuxbrew\"",
      "export PATH=\"$HOMEBREW_PREFIX/bin:$HOMEBREW_PREFIX/sbin:$HOME/.local/bin:$PATH\"",
      "if command -v brew >/dev/null 2>&1; then",
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
    ]));
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

log() { printf '\\n\\033[1;36m==>\\033[0m %s\\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
apt_install() { sudo apt-get install -y "$@"; }
snap_install() {
  local name="$1"
  shift
  if snap list "$name" >/dev/null 2>&1; then echo "snap package already installed: $name"; else sudo snap install "$name" "$@"; fi
}
flatpak_install() {
  local ref="$1"
  if flatpak info "$ref" >/dev/null 2>&1; then echo "flatpak already installed: $ref"; else flatpak install -y flathub "$ref"; fi
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

const startRun = async (config) => {
  if (currentRun) throw new Error("A setup run is already in progress.");
  const generatedDir = getGeneratedDir();
  const { file } = await saveGeneratedScript(config);
  const logFile = path.join(generatedDir, "last-run.log");
  const logStream = createWriteStream(logFile, { flags: "a" });
  currentRun = { file, logFile };
  sendEvent("run-start", { file, logFile });
  const child = spawn("bash", [file], { cwd: generatedDir, env: process.env });
  const onData = (chunk) => {
    const text = chunk.toString();
    logStream.write(text);
    sendEvent("log", { text });
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", (code) => {
    logStream.end();
    sendEvent("run-end", { code, logFile });
    currentRun = null;
  });
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
    if (url.pathname === "/api/status" && req.method === "GET") {
      return json(res, 200, await getStatus());
    }
    if (url.pathname === "/api/generate" && req.method === "POST") {
      return json(res, 200, { script: generateScript(await readBody(req)) });
    }
    if (url.pathname === "/api/save" && req.method === "POST") {
      return json(res, 200, await saveGeneratedScript(await readBody(req)));
    }
    if (url.pathname === "/api/run" && req.method === "POST") {
      await startRun(await readBody(req));
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/api/open-terminal" && req.method === "POST") {
      const { file } = await saveGeneratedScript(await readBody(req));
      await launchTerminal(`bash ${JSON.stringify(file)}`);
      return json(res, 200, { ok: true, file });
    }
    if (url.pathname === "/api/auth" && req.method === "POST") {
      const body = await readBody(req);
      const commands = {
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
