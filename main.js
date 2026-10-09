const { app, BaseWindow, WebContentsView, ipcMain, session, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
require('dotenv').config();

// ========== BACKEND SERVICES ==========
const backends = {
  proxy: null,
  studio: null,
  flow: null
};

function startBackend(name, cmd, args, cwd, env = {}) {
  console.log(`[${name}] Starting: ${cmd} ${args.join(' ')}`);
  const proc = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', d => console.log(`[${name}] ${d.toString().trim()}`));
  proc.stderr.on('data', d => console.error(`[${name}] ${d.toString().trim()}`));
  proc.on('exit', code => console.log(`[${name}] exited with code: ${code}`));
  proc.on('error', err => console.error(`[${name}] spawn error:`, err.message));
  return proc;
}

function launchAllBackends() {
  console.log('🚀 Launching backend services...');

  // 1. DolaProxy (Node.js) — port 8317
  const proxyEntry = path.join(__dirname, 'backend/dola-proxy/src/server.js');
  if (fs.existsSync(proxyEntry)) {
    backends.proxy = startBackend(
      'DolaProxy',
      'node',
      [proxyEntry],
      path.join(__dirname, 'backend/dola-proxy'),
      { PORT: process.env.DOLA_PROXY_PORT || '8317' }
    );
  } else {
    console.warn('[DolaProxy] Not found — skipping. Clone the repo into backend/dola-proxy/');
  }

  // 2. Dola Studio (Python) — port 8000
  const pythonExe = process.platform === 'win32'
    ? path.join(__dirname, 'backend/dola-studio/.venv/Scripts/python.exe')
    : path.join(__dirname, 'backend/dola-studio/.venv/bin/python');
  const studioEntry = path.join(__dirname, 'backend/dola-studio/server.py');

  if (fs.existsSync(pythonExe) && fs.existsSync(studioEntry)) {
    backends.studio = startBackend(
      'DolaStudio',
      pythonExe,
      [studioEntry],
      path.join(__dirname, 'backend/dola-studio'),
      { PORT: process.env.DOLA_STUDIO_PORT || '8000' }
    );
  } else {
    console.warn('[DolaStudio] Not found — skipping. Clone the repo and run install.ps1');
  }

  // 3. DolaFlow (Vite) — port 5173
  const flowPkg = path.join(__dirname, 'backend/dola-flow/package.json');
  if (fs.existsSync(flowPkg)) {
    backends.flow = startBackend(
      'DolaFlow',
      'npm',
      ['run', 'dev'],
      path.join(__dirname, 'backend/dola-flow'),
      { PORT: process.env.DOLA_FLOW_PORT || '5173' }
    );
  } else {
    console.warn('[DolaFlow] Not found — skipping. Clone the repo into backend/dola-flow/');
  }
}

function stopAllBackends() {
  Object.entries(backends).forEach(([name, proc]) => {
    if (proc && !proc.killed) {
      console.log(`[${name}] Stopping...`);
      proc.kill();
    }
  });
}

// ========== MAIN WINDOW ==========
let mainWindow;
let views = {};

async function createWindow() {
  mainWindow = new BaseWindow({
    width: 1920,
    height: 1080,
    title: process.env.APP_NAME || 'Dola Multi-Browser Studio'
  });

  // Panel kiri: Google AI Studio
  views.aiStudio = new WebContentsView({
    webPreferences: {
      partition: 'persist:ai-studio',
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  views.aiStudio.webContents.loadURL('https://aistudio.google.com/apps');
  mainWindow.contentView.addChildView(views.aiStudio);

  // Panel tengah: Dola Chat
  views.dolaChat = new WebContentsView({
    webPreferences: {
      partition: 'persist:dola-chat',
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  views.dolaChat.webContents.loadURL('https://www.dola.com/chat/');
  mainWindow.contentView.addChildView(views.dolaChat);

  // Panel kanan: Custom UI (renderer)
  views.panel = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  views.panel.webContents.loadFile(path.join(__dirname, 'renderer/index.html'));
  mainWindow.contentView.addChildView(views.panel);

  // Initial layout
  layoutPanels();

  // Handle resize
  mainWindow.on('resize', layoutPanels);

  // Handle close
  mainWindow.on('closed', () => {
    mainWindow = null;
    views = {};
  });
}

function layoutPanels() {
  if (!mainWindow) return;
  const bounds = mainWindow.getContentBounds();
  const w = bounds.width;
  const h = bounds.height;
  const third = Math.floor(w / 3);
  const remainder = w - (third * 2);

  if (views.aiStudio) views.aiStudio.setBounds({ x: 0, y: 0, width: third, height: h });
  if (views.dolaChat) views.dolaChat.setBounds({ x: third, y: 0, width: third, height: h });
  if (views.panel) views.panel.setBounds({ x: third * 2, y: 0, width: remainder, height: h });
}

// ========== CHROME EXTENSION LOADER ==========
async function loadChromeExtensions() {
  const extDir = path.join(__dirname, 'extensions');
  if (!fs.existsSync(extDir)) return;

  const exts = fs.readdirSync(extDir).filter(f => {
    const fullPath = path.join(extDir, f);
    return fs.statSync(fullPath).isDirectory() && f !== '.gitkeep';
  });

  for (const ext of exts) {
    try {
      const loaded = await session.defaultSession.loadExtension(
        path.join(extDir, ext),
        { allowFileAccess: true }
      );
      console.log(`✅ Extension loaded: ${loaded.name}`);
    } catch (err) {
      console.error(`❌ Failed to load extension ${ext}:`, err.message);
    }
  }
}

// ========== IPC: DOLA PROXY (Chat) ==========
ipcMain.handle('dola:chat', async (_, { messages, model, stream }) => {
  const port = process.env.DOLA_PROXY_PORT || 8317;
  const baseURL = `http://127.0.0.1:${port}/v1`;
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DOLA_PROXY_API_KEY || ''}`
      },
      body: JSON.stringify({ model, messages, stream: false })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    console.error('[dola:chat] Error:', err.message);
    return { choices: [{ message: { content: `Error: ${err.message}` } }] };
  }
});

// ========== IPC: DOLA STUDIO (Video) ==========
ipcMain.handle('dola:video', async (_, opts) => {
  const port = process.env.DOLA_STUDIO_PORT || 8000;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${baseURL}/v1/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DOLA_STUDIO_API_KEY || ''}`
      },
      body: JSON.stringify(opts)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    console.error('[dola:video] Error:', err.message);
    throw err;
  }
});

ipcMain.handle('dola:videoStatus', async (_, id) => {
  const port = process.env.DOLA_STUDIO_PORT || 8000;
  const baseURL = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${baseURL}/v1/videos/${id}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    console.error('[dola:videoStatus] Error:', err.message);
    throw err;
  }
});

// ========== IPC: BACKEND HEALTH ==========
ipcMain.handle('backend:health', async () => {
  const check = async (url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch {
      return false;
    }
  };
  const proxyPort = process.env.DOLA_PROXY_PORT || 8317;
  const studioPort = process.env.DOLA_STUDIO_PORT || 8000;
  const flowPort = process.env.DOLA_FLOW_PORT || 5173;
  return {
    proxy: await check(`http://127.0.0.1:${proxyPort}/health`),
    studio: await check(`http://127.0.0.1:${studioPort}/`),
    flow: await check(`http://127.0.0.1:${flowPort}/`)
  };
});

// ========== IPC: SKILL MANAGER ==========
const SKILLS_DIR = path.join(__dirname, 'skills');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ipcMain.handle('skills:list', async () => {
  ensureDir(SKILLS_DIR);
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const skillFile = path.join(SKILLS_DIR, e.name, 'SKILL.md');
      const exists = fs.existsSync(skillFile);
      return {
        name: e.name,
        hasFile: exists,
        content: exists ? fs.readFileSync(skillFile, 'utf-8').slice(0, 500) : null
      };
    });
});

ipcMain.handle('skills:load', async (_, name) => {
  const file = path.join(SKILLS_DIR, name, 'SKILL.md');
  if (!fs.existsSync(file)) throw new Error('Skill not found: ' + name);
  return fs.readFileSync(file, 'utf-8');
});

ipcMain.handle('skills:import', async (_, sourcePath) => {
  const stat = fs.statSync(sourcePath);

  if (stat.isDirectory()) {
    const name = path.basename(sourcePath);
    const target = path.join(SKILLS_DIR, name);
    fs.cpSync(sourcePath, target, { recursive: true });
    return { imported: name };
  }

  if (sourcePath.endsWith('.zip')) {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(sourcePath);
    const name = path.basename(sourcePath, '.zip');
    const target = path.join(SKILLS_DIR, name);
    ensureDir(target);
    zip.extractAllTo(target, true);
    return { imported: name };
  }

  if (sourcePath.endsWith('.md')) {
    const name = path.basename(sourcePath, '.md');
    const target = path.join(SKILLS_DIR, name);
    ensureDir(target);
    fs.copyFileSync(sourcePath, path.join(target, 'SKILL.md'));
    return { imported: name };
  }

  throw new Error('Unsupported format. Use .zip, .md, or a directory.');
});

ipcMain.handle('skills:delete', async (_, name) => {
  const target = path.join(SKILLS_DIR, name);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    return { deleted: name };
  }
  throw new Error('Skill not found: ' + name);
});

// ========== IPC: EXTENSION MANAGER ==========
const EXTENSIONS_DIR = path.join(__dirname, 'extensions');

ipcMain.handle('ext:list', async () => {
  ensureDir(EXTENSIONS_DIR);
  const loaded = session.defaultSession.getAllExtensions();
  const onDisk = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);

  return {
    loaded: loaded.map(e => ({ id: e.id, name: e.name, version: e.version })),
    onDisk
  };
});

ipcMain.handle('ext:enable', async (_, name) => {
  const extPath = path.join(EXTENSIONS_DIR, name);
  if (!fs.existsSync(extPath)) throw new Error('Extension directory not found: ' + name);
  const ext = await session.defaultSession.loadExtension(extPath, { allowFileAccess: true });
  return { enabled: ext.name };
});

ipcMain.handle('ext:disable', async (_, name) => {
  const loaded = session.defaultSession.getAllExtensions();
  const target = loaded.find(e => e.name === name);
  if (target) {
    session.defaultSession.removeExtension(target.id);
    return { disabled: name };
  }
  throw new Error('Extension not loaded: ' + name);
});

// ========== IPC: FILE DIALOGS ==========
ipcMain.handle('dialog:pickFile', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [
      { name: 'Skill Files', extensions: ['md', 'zip'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:pickFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// ========== KEYBOARD SHORTCUTS ==========
app.whenReady().then(() => {
  const { globalShortcut } = require('electron');

  globalShortcut.register('CommandOrControl+1', () => {
    if (views.aiStudio) views.aiStudio.webContents.focus();
  });
  globalShortcut.register('CommandOrControl+2', () => {
    if (views.dolaChat) views.dolaChat.webContents.focus();
  });
  globalShortcut.register('CommandOrControl+3', () => {
    if (views.panel) views.panel.webContents.focus();
  });
});

// ========== APP LIFECYCLE ==========
app.whenReady().then(async () => {
  launchAllBackends();
  await loadChromeExtensions();
  await createWindow();

  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopAllBackends();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopAllBackends();
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
});
