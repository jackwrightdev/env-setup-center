const modules = [
  {
    id: "base",
    title: "Ubuntu Base",
    description: "Core packages, build tools, Python, ADB/Fastboot, Flatpak, Snap, SSH, rsync, jq, and Flutter Linux desktop dependencies.",
    tags: ["apt", "build", "python"],
    recommended: true
  },
  {
    id: "brew",
    title: "Homebrew",
    description: "Installs Homebrew for Linux and prepares it for runtime packages and service management.",
    tags: ["brew"],
    recommended: true
  },
  {
    id: "brew-packages",
    title: "Brew Runtimes",
    description: "Node, OpenJDK 17, PHP, Composer, MySQL, PostgreSQL, Watchman, and GCC.",
    tags: ["node", "java", "db"],
    recommended: true
  },
  {
    id: "flutter",
    title: "Flutter",
    description: "Clones or updates Flutter stable at your selected path.",
    tags: ["mobile", "sdk"],
    recommended: true
  },
  {
    id: "desktop-apps",
    title: "Desktop Apps",
    description: "Android Studio, Slack, Postman, Termius, Remmina, and DBeaver.",
    tags: ["snap", "flatpak"],
    recommended: true
  },
  {
    id: "chrome",
    title: "Google Chrome",
    description: "Adds Google's apt repository and installs Chrome Stable.",
    tags: ["browser"],
    recommended: true
  },
  {
    id: "vscode",
    title: "VS Code",
    description: "Adds Microsoft's apt repository and installs Visual Studio Code.",
    tags: ["editor"],
    recommended: true
  },
  {
    id: "github-cli",
    title: "GitHub CLI",
    description: "Adds the official GitHub CLI apt repository and installs gh.",
    tags: ["auth", "git"],
    recommended: true
  },
  {
    id: "cloud-cli",
    title: "Cloud CLIs",
    description: "Installs Google Cloud CLI and AWS CLI via Snap.",
    tags: ["gcloud", "aws"],
    recommended: true
  },
  {
    id: "onepassword",
    title: "1Password CLI",
    description: "Adds 1Password's apt repository and installs the op CLI.",
    tags: ["secrets"],
    recommended: true
  },
  {
    id: "codex-cli",
    title: "Codex CLI",
    description: "Installs the Codex CLI with the official standalone Linux installer.",
    tags: ["openai"],
    recommended: true
  },
  {
    id: "codex-desktop",
    title: "Codex Desktop Linux",
    description: "Installs from your codex-desktop-linux wrapper project, preferring an existing local .deb.",
    tags: ["local repo", "gui"],
    recommended: true
  },
  {
    id: "shell-setup",
    title: "Shell Setup",
    description: "Writes PATH, Android, Flutter, Java, Homebrew, and direnv setup into ~/.bashrc.",
    tags: ["bashrc"],
    recommended: true
  },
  {
    id: "docker",
    title: "Docker Engine",
    description: "Installs Docker Engine, Compose plugin, Buildx, and adds your user to the docker group.",
    tags: ["containers"],
    recommended: false
  },
  {
    id: "kubernetes",
    title: "Kubernetes Tools",
    description: "Installs kubectl and helm through Homebrew.",
    tags: ["k8s"],
    recommended: false
  },
  {
    id: "terraform",
    title: "Terraform",
    description: "Installs Terraform through Homebrew.",
    tags: ["infra"],
    recommended: false
  },
  {
    id: "azure",
    title: "Azure CLI",
    description: "Installs Azure CLI using Microsoft's Debian installer.",
    tags: ["cloud"],
    recommended: false
  },
  {
    id: "mkcert",
    title: "mkcert",
    description: "Installs mkcert and nss, then creates a trusted local CA.",
    tags: ["https"],
    recommended: false
  }
];

const authActions = [
  ["sudo", "Sudo", "Unlock sudo for inline installer runs"],
  ["github", "GitHub", "Run gh auth login"],
  ["gcloud", "Google Cloud", "Run gcloud init"],
  ["aws", "AWS", "Run aws configure"],
  ["onepassword", "1Password", "Run op account add"],
  ["codex", "Codex", "Open Codex login"],
  ["flutter", "Flutter", "Accept Android licenses and run doctor"]
];

const state = {
  selected: new Set(modules.filter((module) => module.recommended).map((module) => module.id)),
  status: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const toast = (message) => {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
};

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
};

const config = () => ({
  selected: Array.from(state.selected),
  startServices: $("#start-services").checked,
  flutterDir: $("#flutter-dir").value.trim(),
  androidHome: $("#android-home").value.trim(),
  codexDesktopRepo: $("#codex-repo").value.trim(),
  codexDesktopMode: $("#codex-mode").value,
  gitName: $("#git-name").value.trim(),
  gitEmail: $("#git-email").value.trim()
});

const renderModules = () => {
  $("#module-grid").innerHTML = modules
    .map((module) => {
      const checked = state.selected.has(module.id) ? "checked" : "";
      const status = module.recommended ? "Recommended" : "Optional";
      return `
        <article class="module-card">
          <div class="module-top">
            <div>
              <h3>${module.title}</h3>
              <div class="module-meta">${status}</div>
            </div>
            <input type="checkbox" data-module="${module.id}" ${checked} aria-label="Select ${module.title}" />
          </div>
          <p>${module.description}</p>
          <div class="module-tags">
            ${module.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
          </div>
        </article>
      `;
    })
    .join("");

  $$("[data-module]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.selected.add(input.dataset.module);
      else state.selected.delete(input.dataset.module);
      updateSelectionCount();
      refreshScript();
    });
  });
};

const renderAuth = () => {
  $("#auth-list").innerHTML = authActions
    .map(([id, title, description]) => `
      <div class="auth-row">
        <div>
          <div class="status-name">${title}</div>
          <div class="status-version">${description}</div>
        </div>
        <button data-auth="${id}">Open</button>
      </div>
    `)
    .join("");

  $$("[data-auth]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api("/api/auth", {
          method: "POST",
          body: JSON.stringify({ target: button.dataset.auth })
        });
        toast("Opened terminal auth flow");
      } catch (error) {
        toast(error.message);
      }
    });
  });
};

const statusKeys = [
  ["git", "Git"],
  ["curl", "curl"],
  ["brew", "Homebrew"],
  ["node", "Node"],
  ["java", "OpenJDK"],
  ["php", "PHP"],
  ["composer", "Composer"],
  ["mysql", "MySQL"],
  ["psql", "PostgreSQL"],
  ["watchman", "Watchman"],
  ["flutter", "Flutter"],
  ["gh", "GitHub CLI"],
  ["gcloud", "Google Cloud CLI"],
  ["aws", "AWS CLI"],
  ["op", "1Password CLI"],
  ["codex", "Codex CLI"],
  ["codex-desktop", "Codex Desktop"],
  ["androidStudio", "Android Studio"],
  ["code", "VS Code"],
  ["dbeaver", "DBeaver"],
  ["docker", "Docker"],
  ["kubectl", "kubectl"],
  ["helm", "Helm"],
  ["terraform", "Terraform"],
  ["az", "Azure CLI"]
];

const renderStatus = (status) => {
  $("#os-label").textContent = status.os || "Ubuntu";
  const installed = statusKeys.filter(([key]) => status[key]?.installed).length;
  const total = statusKeys.length;
  $("#status-summary").textContent = `${installed}/${total} detected`;
  $("#metrics").innerHTML = `
    <div class="metric"><strong>${installed}</strong><span>Tools detected</span></div>
    <div class="metric"><strong>${state.selected.size}</strong><span>Modules selected</span></div>
    <div class="metric"><strong>${status.home ? "Yes" : "No"}</strong><span>Local session</span></div>
    <div class="metric"><strong>${$("#codex-mode").value}</strong><span>Desktop mode</span></div>
  `;
  $("#status-grid").innerHTML = statusKeys
    .map(([key, label]) => {
      const item = status[key] || { installed: false, version: "" };
      const pill = item.installed ? '<span class="pill ok">Installed</span>' : '<span class="pill missing">Missing</span>';
      const version = item.version || (item.installed ? "Detected" : "Not detected");
      return `
        <div class="status-row">
          <div>
            <div class="status-name">${label}</div>
            <div class="status-version">${version}</div>
          </div>
          ${pill}
        </div>
      `;
    })
    .join("");
};

const updateSelectionCount = () => {
  $("#selection-count").textContent = `${state.selected.size} selected`;
  if (state.status) renderStatus(state.status);
};

const refreshStatus = async () => {
  $("#status-summary").textContent = "Scanning...";
  try {
    state.status = await api("/api/status");
    renderStatus(state.status);
  } catch (error) {
    toast(error.message);
  }
};

const refreshScript = async () => {
  try {
    const { script } = await api("/api/generate", {
      method: "POST",
      body: JSON.stringify(config())
    });
    $("#script-preview").textContent = script;
  } catch (error) {
    $("#script-preview").textContent = error.message;
  }
};

const saveScript = async () => {
  const result = await api("/api/save", {
    method: "POST",
    body: JSON.stringify(config())
  });
  $("#script-path").textContent = result.file;
  toast("Script saved");
};

const wireNavigation = () => {
  $$(".step").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".step").forEach((step) => step.classList.remove("active"));
      $$(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.view}`).classList.add("active");
      $("#view-title").textContent = button.textContent;
      if (button.dataset.view === "script") refreshScript();
    });
  });
};

const wireActions = () => {
  $("#refresh-status").addEventListener("click", refreshStatus);
  $("#save-script").addEventListener("click", async () => {
    try {
      await saveScript();
    } catch (error) {
      toast(error.message);
    }
  });
  $("#select-recommended").addEventListener("click", () => {
    state.selected = new Set(modules.filter((module) => module.recommended).map((module) => module.id));
    renderModules();
    updateSelectionCount();
    refreshScript();
  });
  $("#select-all").addEventListener("click", () => {
    state.selected = new Set(modules.map((module) => module.id));
    renderModules();
    updateSelectionCount();
    refreshScript();
  });
  $("#clear-all").addEventListener("click", () => {
    state.selected.clear();
    renderModules();
    updateSelectionCount();
    refreshScript();
  });
  ["flutter-dir", "android-home", "codex-repo", "codex-mode", "git-name", "git-email", "start-services"].forEach((id) => {
    $(`#${id}`).addEventListener("input", refreshScript);
    $(`#${id}`).addEventListener("change", refreshScript);
  });
  $("#open-terminal").addEventListener("click", async () => {
    try {
      await api("/api/open-terminal", {
        method: "POST",
        body: JSON.stringify(config())
      });
      toast("Opened terminal runner");
    } catch (error) {
      toast(error.message);
    }
  });
  $("#run-inline").addEventListener("click", async () => {
    try {
      $("#log-output").textContent = "";
      $("#run-state").textContent = "Running";
      await api("/api/run", {
        method: "POST",
        body: JSON.stringify(config())
      });
    } catch (error) {
      $("#run-state").textContent = "Idle";
      toast(error.message);
    }
  });
};

const wireEvents = () => {
  const events = new EventSource("/api/events");
  events.addEventListener("run-start", (event) => {
    const data = JSON.parse(event.data);
    $("#run-state").textContent = "Running";
    $("#script-path").textContent = data.file;
  });
  events.addEventListener("log", (event) => {
    const data = JSON.parse(event.data);
    const log = $("#log-output");
    log.textContent += data.text;
    log.scrollTop = log.scrollHeight;
  });
  events.addEventListener("run-end", (event) => {
    const data = JSON.parse(event.data);
    $("#run-state").textContent = data.code === 0 ? "Complete" : `Exited ${data.code}`;
    toast(data.code === 0 ? "Setup complete" : "Setup exited with errors");
  });
};

const init = async () => {
  renderModules();
  renderAuth();
  wireNavigation();
  wireActions();
  wireEvents();
  updateSelectionCount();
  await refreshScript();
  await refreshStatus();
};

init();
