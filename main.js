import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { startServer } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let localServer;

app.commandLine.appendSwitch("no-sandbox");

const createWindow = async () => {
  const generatedDir = path.join(app.getPath("userData"), "generated");
  mkdirSync(generatedDir, { recursive: true });
  process.env.ENV_SETUP_CENTER_DATA_DIR = generatedDir;

  localServer = await startServer({ port: 0 });

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 680,
    title: "Environment Setup Center",
    backgroundColor: "#f6f7f3",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(localServer.url);
};

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (localServer?.server) localServer.server.close();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
