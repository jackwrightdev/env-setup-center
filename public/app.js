let modules = [];
let distroProfiles = [];
let vmTestSuites = [];

const authActions = [
  ["sudo", "Sudo", "Unlock sudo for terminal installer runs"],
  ["github", "GitHub", "Run gh auth login"],
  ["gcloud", "Google Cloud", "Run gcloud init"],
  ["aws", "AWS", "Run aws configure"],
  ["onepassword", "1Password", "Run op account add"],
  ["codex", "Codex", "Open Codex login"],
  ["flutter", "Flutter", "Accept Android licenses and run doctor"]
];

const state = {
  selected: new Set(),
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

const loadManifest = async () => {
  const manifest = await api("/api/manifest");
  modules = manifest.modules || [];
  distroProfiles = manifest.distroProfiles || [];
  vmTestSuites = manifest.vmTestSuites || [];
  state.selected = new Set(modules.filter((module) => module.recommended).map((module) => module.id));
};

const config = () => ({
  selected: Array.from(state.selected),
  startServices: $("#start-services").checked,
  distroProfile: $("#distro-profile").value,
  flutterDir: $("#flutter-dir").value.trim(),
  androidHome: $("#android-home").value.trim(),
  codexDesktopRepo: $("#codex-repo").value.trim(),
  codexDesktopMode: $("#codex-mode").value,
  gitName: $("#git-name").value.trim(),
  gitEmail: $("#git-email").value.trim()
});

const renderDistroProfiles = () => {
  const select = $("#distro-profile");
  select.innerHTML = distroProfiles
    .map((profile) => `<option value="${profile.id}">${profile.title}</option>`)
    .join("");
};

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

const renderTestSuites = () => {
  $("#test-grid").innerHTML = vmTestSuites
    .map((suite) => `
      <article class="module-card test-card">
        <div class="module-top">
          <div>
            <h3>${suite.title}</h3>
            <div class="module-meta">Profile: ${suite.profile}</div>
          </div>
          <span class="pill missing">Untested</span>
        </div>
        <ol class="check-list">
          ${suite.checks.map((check) => `<li>${check}</li>`).join("")}
        </ol>
        <button data-test-profile="${suite.profile}">Use Profile</button>
      </article>
    `)
    .join("");

  $$("[data-test-profile]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#distro-profile").value = button.dataset.testProfile;
      refreshScript();
      if (state.status) renderStatus(state.status);
      toast(`Profile set to ${button.dataset.testProfile}`);
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
    <div class="metric"><strong>${$("#distro-profile").value}</strong><span>Distro profile</span></div>
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
  ["distro-profile", "flutter-dir", "android-home", "codex-repo", "codex-mode", "git-name", "git-email", "start-services"].forEach((id) => {
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
  $("#log-output").textContent = "Runs now open in a system terminal. The generated script asks for sudo before installer steps begin.";
};

const wireEvents = () => {
  const events = new EventSource("/api/events");
  events.addEventListener("run-start", () => {});
  events.addEventListener("log", () => {});
  events.addEventListener("run-end", () => {});
};

const init = async () => {
  await loadManifest();
  renderDistroProfiles();
  renderModules();
  renderAuth();
  renderTestSuites();
  wireNavigation();
  wireActions();
  wireEvents();
  updateSelectionCount();
  await refreshScript();
  await refreshStatus();
};

init();
