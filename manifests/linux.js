export const distroProfiles = [
  {
    id: "auto",
    title: "Auto-detect",
    description: "Read /etc/os-release and choose the closest Linux profile."
  },
  {
    id: "ubuntu",
    title: "Ubuntu / Debian",
    description: "APT-first profile for Ubuntu, Debian, Pop!_OS, Mint, and similar systems."
  },
  {
    id: "fedora",
    title: "Fedora",
    description: "DNF-first profile for Fedora Workstation-style systems."
  },
  {
    id: "bazzite",
    title: "Bazzite",
    description: "Fedora Atomic/Bazzite profile using Flatpak, Homebrew, and rpm-ostree layering only where needed."
  },
  {
    id: "arch",
    title: "Arch Linux",
    description: "Pacman-first profile with AUR-helper fallbacks where needed."
  },
  {
    id: "manjaro",
    title: "Manjaro",
    description: "Pacman/Manjaro profile with pamac support for AUR-like packages."
  }
];

export const installModules = [
  {
    id: "base",
    title: "Linux Base",
    scriptTitle: "Installing Linux base tools",
    description: "Core packages, build tools, Python, ADB/Fastboot, Flatpak, SSH, rsync, jq, FUSE, and Flutter Linux desktop dependencies.",
    tags: ["apt", "dnf", "rpm-ostree", "pacman"],
    recommended: true
  },
  {
    id: "brew",
    title: "Homebrew",
    scriptTitle: "Installing Homebrew for Linux",
    description: "Installs Homebrew for Linux and prepares it for runtime packages and service management.",
    tags: ["brew"],
    recommended: true
  },
  {
    id: "brew-packages",
    title: "Brew Runtimes",
    scriptTitle: "Installing Brew runtimes and services",
    description: "Node, OpenJDK 17, PHP, Composer, MySQL, PostgreSQL, Watchman, and GCC.",
    tags: ["node", "java", "db"],
    recommended: true
  },
  {
    id: "flutter",
    title: "Flutter",
    scriptTitle: "Installing Flutter",
    description: "Clones or updates Flutter stable at your selected path.",
    tags: ["mobile", "sdk"],
    recommended: true
  },
  {
    id: "desktop-apps",
    title: "Desktop Apps",
    scriptTitle: "Installing desktop apps",
    description: "Android Studio, Slack, Postman, Termius, Remmina, and DBeaver using Flatpak where possible.",
    tags: ["flatpak"],
    recommended: true
  },
  {
    id: "chrome",
    title: "Google Chrome",
    scriptTitle: "Installing Google Chrome",
    description: "Installs Chrome through native repositories where available, Flatpak on Bazzite, with Chromium fallback on Arch-style systems.",
    tags: ["browser", "native", "flatpak"],
    recommended: true
  },
  {
    id: "vscode",
    title: "VS Code",
    scriptTitle: "Installing Visual Studio Code",
    description: "Installs VS Code through Microsoft repositories, Flatpak on Bazzite, or Arch/Manjaro package tooling.",
    tags: ["editor", "native", "flatpak"],
    recommended: true
  },
  {
    id: "github-cli",
    title: "GitHub CLI",
    scriptTitle: "Installing GitHub CLI",
    description: "Installs gh through Homebrew for a consistent cross-distro path.",
    tags: ["auth", "git", "brew"],
    recommended: true
  },
  {
    id: "cloud-cli",
    title: "Cloud CLIs",
    scriptTitle: "Installing cloud CLIs",
    description: "Installs Google Cloud CLI and AWS CLI through Homebrew.",
    tags: ["gcloud", "aws", "brew"],
    recommended: true
  },
  {
    id: "onepassword",
    title: "1Password CLI",
    scriptTitle: "Installing 1Password CLI",
    description: "Installs op through the Debian repository on Ubuntu/Debian, with Homebrew fallback elsewhere.",
    tags: ["secrets"],
    recommended: true
  },
  {
    id: "codex-cli",
    title: "Codex CLI",
    scriptTitle: "Installing Codex CLI",
    description: "Installs the Codex CLI with the official standalone Linux installer.",
    tags: ["openai"],
    recommended: true
  },
  {
    id: "codex-desktop",
    title: "Codex Desktop Linux",
    scriptTitle: "Installing Codex Desktop Linux wrapper",
    description: "Installs from your codex-desktop-linux wrapper project, preferring an existing local .deb on Debian-style systems.",
    tags: ["local repo", "gui"],
    recommended: true
  },
  {
    id: "shell-setup",
    title: "Shell Setup",
    scriptTitle: "Writing shell environment block",
    description: "Writes PATH, Android, Flutter, Java, Homebrew, and direnv setup into ~/.bashrc.",
    tags: ["bashrc"],
    recommended: true
  },
  {
    id: "docker",
    title: "Docker Engine",
    scriptTitle: "Installing Docker Engine",
    description: "Installs Docker Engine, Compose plugin, Buildx, and adds your user to the docker group.",
    tags: ["containers"],
    recommended: false
  },
  {
    id: "kubernetes",
    title: "Kubernetes Tools",
    scriptTitle: "Installing Kubernetes tools",
    description: "Installs kubectl and helm through Homebrew.",
    tags: ["k8s"],
    recommended: false
  },
  {
    id: "terraform",
    title: "Terraform",
    scriptTitle: "Installing Terraform",
    description: "Installs Terraform through Homebrew.",
    tags: ["infra"],
    recommended: false
  },
  {
    id: "azure",
    title: "Azure CLI",
    scriptTitle: "Installing Azure CLI",
    description: "Installs Azure CLI using native Debian support or Homebrew fallback.",
    tags: ["cloud"],
    recommended: false
  },
  {
    id: "mkcert",
    title: "mkcert",
    scriptTitle: "Installing mkcert",
    description: "Installs mkcert and nss, then creates a trusted local CA.",
    tags: ["https"],
    recommended: false
  }
];

export const sudoModules = [
  "base",
  "brew",
  "brew-packages",
  "desktop-apps",
  "chrome",
  "vscode",
  "github-cli",
  "onepassword",
  "cloud-cli",
  "codex-desktop",
  "docker",
  "azure",
  "mkcert"
];

export const moduleSteps = {
  base: ["install_base_tools"],
  brew: ["ensure_homebrew", "brew update"],
  "brew-packages": [
    "brew_install composer gcc mysql node openjdk@17 php postgresql watchman",
    "npm install -g corepack npm-check-updates",
    "corepack enable || true"
  ],
  "desktop-apps": ["install_desktop_apps"],
  chrome: ["install_chrome"],
  vscode: ["install_vscode"],
  "cloud-cli": ["install_cloud_clis"],
  "github-cli": ["install_github_cli"],
  onepassword: ["install_onepassword_cli"],
  "codex-cli": ["if ! have codex; then curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh; fi"],
  docker: ["install_docker"],
  kubernetes: ["brew_install kubectl helm"],
  terraform: ["brew_install terraform"],
  azure: ["install_azure_cli"],
  mkcert: ["brew_install mkcert nss", "mkcert -install"]
};

export const vmTestSuites = [
  {
    id: "ubuntu",
    title: "Ubuntu / Debian VM",
    profile: "ubuntu",
    checks: [
      "Install the latest .deb or run the AppImage with libfuse2t64 installed.",
      "Generate recommended setup with Ubuntu/Debian profile.",
      "Run only Linux Base first and verify apt packages complete.",
      "Run Homebrew + Brew Runtimes and verify node, java, php, composer, mysql, psql, and watchman.",
      "Run Desktop Apps and verify Flatpak apps appear.",
      "Run Codex CLI and Codex Desktop Linux wrapper."
    ]
  },
  {
    id: "fedora",
    title: "Fedora VM",
    profile: "fedora",
    checks: [
      "Install or run the AppImage; verify FUSE support if using AppImage.",
      "Generate setup with Fedora profile.",
      "Run Linux Base and verify dnf groupinstall plus package names.",
      "Run Chrome and VS Code repo setup.",
      "Run Desktop Apps through Flatpak.",
      "Run Docker optional module and verify the docker service starts."
    ]
  },
  {
    id: "bazzite",
    title: "Bazzite VM",
    profile: "bazzite",
    checks: [
      "Run the AppImage directly or integrate it with Gear Lever.",
      "Generate setup with Bazzite profile or verify auto-detect maps Bazzite to bazzite.",
      "Run Linux Base and confirm rpm-ostree stages only missing host packages.",
      "Reboot after any rpm-ostree layered packages, then rerun status checks.",
      "Run Desktop Apps, Chrome, and VS Code and verify they install through Flatpak.",
      "Run Homebrew-backed runtimes and CLIs without using dnf."
    ]
  },
  {
    id: "manjaro",
    title: "Manjaro VM",
    profile: "manjaro",
    checks: [
      "Generate setup with Manjaro profile.",
      "Run Linux Base and verify pacman package names.",
      "Confirm pamac or yay availability for Chrome; otherwise verify Chromium fallback.",
      "Run Flatpak desktop apps and confirm Flathub is enabled.",
      "Run Homebrew-backed cloud and GitHub CLIs."
    ]
  },
  {
    id: "arch",
    title: "Arch VM",
    profile: "arch",
    checks: [
      "Generate setup with Arch profile.",
      "Run Linux Base and verify pacman package names on a clean install.",
      "Confirm behavior without an AUR helper: Chrome should fall back to Chromium.",
      "Test optional Docker module and group membership message.",
      "Decide whether the app should install yay or keep AUR helpers user-managed."
    ]
  }
];
