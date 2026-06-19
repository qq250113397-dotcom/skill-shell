const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { execFile, execFileSync } = require('child_process');
const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } = require('electron');
const { scanWorkspace, homePath } = require('./scanner');

let mainWindow = null;
let overlayWindow = null;
let regionSelectWindow = null;
let liveTranslateEnabled = false;
let liveTranslateBusy = false;
let liveTranslateTimer = null;
let lastLiveTranslation = null;
let liveTranslateRegion = null;
const translationCache = new Map();

const AGENT_ROOTS = {
  claude: homePath('.claude', 'skills'),
  codex: homePath('.codex', 'skills'),
  hermes: homePath('.hermes', 'skills'),
};

const TESSERACT_BIN = process.env.TESSERACT_BIN || (fs.existsSync('/opt/homebrew/bin/tesseract') ? '/opt/homebrew/bin/tesseract' : 'tesseract');
const APP_ROOT = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const ARGOS_PYTHON = process.platform === 'win32'
  ? path.join(APP_ROOT, '.venv', 'Scripts', 'python.exe')
  : path.join(APP_ROOT, '.venv', 'bin', 'python');
const ARGOS_MODEL_CANDIDATES = [
  path.join(APP_ROOT, '.cache', 'argos', 'translate-en_zh-1_9.argosmodel'),
  path.join(APP_ROOT, '.cache', 'argos', 'translate-en_zh-1_7.argosmodel'),
];
let argosModelInstallPromise = null;

function safeSkillName(input) {
  return String(input || '')
    .normalize('NFKC')
    .trim()
    .replace(/[\/\\]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function getAgentRoot(agentId) {
  return AGENT_ROOTS[agentId] || null;
}

function getSkillFolder(filePath) {
  return path.dirname(filePath);
}

function hashText(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

function isMostlyEnglish(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const chineseChars = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const latinChars = value.match(/[A-Za-z]/g)?.length || 0;
  return latinChars > chineseChars * 2;
}

async function translateText(text, source = 'en', target = 'zh-CN') {
  const value = String(text || '').trim();
  if (!value) return '';
  const cacheKey = `${source}|${target}|${value}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', value.slice(0, 460));
  url.searchParams.set('langpair', `${source}|${target}`);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const translated = String(payload?.responseData?.translatedText || '').trim();
    const result = translated || value;
    translationCache.set(cacheKey, result);
    return result;
  } catch {
    translationCache.set(cacheKey, value);
    return value;
  }
}

async function translateTextOffline(text, source = 'en', target = 'zh') {
  const value = String(text || '').trim();
  if (!value) return '';
  if (!fs.existsSync(ARGOS_PYTHON)) return null;
  const key = `offline|${source}|${target}|${value}`;
  if (translationCache.has(key)) return translationCache.get(key);

  async function ensureModelInstalled() {
    if (argosModelInstallPromise) return argosModelInstallPromise;
    const installScript = `
import sys
import argostranslate.package as package
path = sys.argv[1]
installed = package.get_installed_packages()
if not any(pkg.from_code == 'en' and pkg.to_code == 'zh' for pkg in installed):
    package.install_from_path(path)
print('ok')
`;
    argosModelInstallPromise = (async () => {
      for (const candidate of ARGOS_MODEL_CANDIDATES) {
        if (!fs.existsSync(candidate)) continue;
        const installed = await execFileAsync(ARGOS_PYTHON, ['-c', installScript, candidate], {
          maxBuffer: 1024 * 1024 * 10,
        })
          .then(() => true)
          .catch(() => false);
        if (installed) return true;
      }
      return false;
    })().finally(() => {
      argosModelInstallPromise = null;
    });
    return argosModelInstallPromise;
  }

  const modelReady = await ensureModelInstalled();
  if (!modelReady) return null;

  const script = `
import sys
import argostranslate.translate as tr

class NoSplitSentencizer:
    def __init__(self, pkg):
        self.pkg = pkg

    def split_sentences(self, text):
        return [text]

tr.StanzaSentencizer = NoSplitSentencizer
tr.MiniSBDSentencizer = NoSplitSentencizer
tr.SpacySentencizerSmall = NoSplitSentencizer

try:
    text = sys.argv[1]
    source = sys.argv[2]
    target = sys.argv[3]
    print(tr.translate(text, source, target))
except Exception as exc:
    print(f"__ERROR__:{exc}", file=sys.stderr)
    raise
`;

  try {
    const { stdout } = await execFileAsync(ARGOS_PYTHON, ['-c', script, value, source, target], {
      maxBuffer: 1024 * 1024 * 10,
    });
    const translated = String(stdout || '').trim();
    translationCache.set(key, translated || value);
    return translated || value;
  } catch {
    return null;
  }
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function captureScreenShot() {
  if (process.platform !== 'darwin') {
    throw new Error('Windows 屏幕翻译需要安装 Tesseract，当前版本暂未内置屏幕截图组件');
  }
  const filePath = path.join(os.tmpdir(), `skill-shell-shot-${Date.now()}.png`);
  await execFileAsync('/usr/sbin/screencapture', ['-x', '-t', 'png', filePath]);
  return filePath;
}

async function captureRegionShot(region) {
  if (process.platform !== 'darwin') {
    throw new Error('Windows 框选翻译暂不可用，skill 简介翻译仍可正常使用');
  }
  const filePath = path.join(os.tmpdir(), `skill-shell-shot-${Date.now()}.png`);
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  const x = Math.max(0, Math.round((region?.x || 0) * scale));
  const y = Math.max(0, Math.round((region?.y || 0) * scale));
  const width = Math.max(1, Math.round((region?.width || 1) * scale));
  const height = Math.max(1, Math.round((region?.height || 1) * scale));
  await execFileAsync('/usr/sbin/screencapture', ['-x', '-R', `${x},${y},${width},${height}`, '-t', 'png', filePath]);
  return filePath;
}

async function runTesseract(imagePath) {
  const basePath = imagePath.replace(/\.png$/i, '');
  await execFileAsync(TESSERACT_BIN, [imagePath, basePath, '--psm', '6', '-l', 'eng']);
  const text = await fsp.readFile(`${basePath}.txt`, 'utf8').catch(() => '');
  await Promise.all([
    fsp.rm(imagePath, { force: true }).catch(() => {}),
    fsp.rm(`${basePath}.txt`, { force: true }).catch(() => {}),
  ]);
  return text.trim();
}

async function analyzeScreenOnce(region = null) {
  const imagePath = region?.width && region?.height ? await captureRegionShot(region) : await captureScreenShot();
  const ocrText = await runTesseract(imagePath);
  if (!ocrText) {
    return { ok: true, ocrText: '', translatedText: '', changed: false };
  }
  const fingerprint = hashText(ocrText);
  if (lastLiveTranslation?.fingerprint === fingerprint) {
    return { ok: true, ...lastLiveTranslation, changed: false };
  }
  const translatedText = (await translateTextOffline(ocrText, 'en', 'zh')) || (await translateText(ocrText, 'en', 'zh-CN'));
  const payload = {
    fingerprint,
    ocrText,
    translatedText,
    updatedAt: new Date().toISOString(),
  };
  lastLiveTranslation = payload;
  return { ok: true, ...payload, changed: true };
}

async function translateSelectionOnce() {
  const result = await analyzeScreenOnce(liveTranslateRegion);
  if (result.ok) {
    broadcastLiveTranslation(result);
    broadcastLiveStatus({
      enabled: liveTranslateEnabled,
      state: result.ocrText ? 'translated' : 'no-text',
      region: liveTranslateRegion,
    });
  }
  return result;
}

function broadcastLiveTranslation(payload) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('live-translation-update', payload);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-translation-update', payload);
  }
}

function broadcastLiveStatus(payload) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('live-translation-status', payload);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-translation-status', payload);
  }
}

function clearLiveTranslationTimer() {
  if (liveTranslateTimer) {
    clearTimeout(liveTranslateTimer);
    liveTranslateTimer = null;
  }
}

async function liveTranslateTick() {
  if (!liveTranslateEnabled || liveTranslateBusy) return;
  liveTranslateBusy = true;
  try {
    broadcastLiveStatus({ enabled: true, state: 'capturing' });
    const result = await analyzeScreenOnce(liveTranslateRegion);
    if (result.ok) {
      broadcastLiveTranslation(result);
      broadcastLiveStatus({ enabled: true, state: result.ocrText ? 'translated' : 'no-text' });
    } else {
      broadcastLiveStatus({ enabled: true, state: 'error', error: result.error || '翻译失败' });
    }
  } catch (error) {
    broadcastLiveStatus({ enabled: true, state: 'error', error: error.message || '翻译失败' });
  } finally {
    liveTranslateBusy = false;
    if (liveTranslateEnabled) {
      clearLiveTranslationTimer();
      liveTranslateTimer = setTimeout(liveTranslateTick, 1600);
    }
  }
}

async function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;
  overlayWindow = new BrowserWindow({
    width: 460,
    height: 340,
    x: 80,
    y: 80,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const overlayUrl = devUrl
    ? `${devUrl}?overlay=1`
    : `${pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).toString()}?overlay=1`;
  await overlayWindow.loadURL(overlayUrl);
  overlayWindow.on('closed', () => {
    overlayWindow = null;
    if (liveTranslateEnabled) {
      liveTranslateEnabled = false;
      clearLiveTranslationTimer();
      broadcastLiveStatus({ enabled: false, state: 'idle' });
    }
  });
  return overlayWindow;
}

async function setLiveTranslationEnabled(nextEnabled) {
  liveTranslateEnabled = Boolean(nextEnabled);
  if (!liveTranslateEnabled) {
    clearLiveTranslationTimer();
    broadcastLiveStatus({ enabled: false, state: 'idle' });
    return { ok: true, enabled: false };
  }

  await ensureOverlayWindow();
  broadcastLiveStatus({ enabled: true, state: 'starting' });
  liveTranslateTick();
  return { ok: true, enabled: true };
}

async function ensureRegionSelectWindow() {
  if (regionSelectWindow && !regionSelectWindow.isDestroyed()) return regionSelectWindow;
  const display = screen.getPrimaryDisplay();
  regionSelectWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  const selectUrl = devUrl
    ? `${devUrl}?overlay=select`
    : `${pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).toString()}?overlay=select`;
  await regionSelectWindow.loadURL(selectUrl);
  regionSelectWindow.setAlwaysOnTop(true, 'screen-saver');
  regionSelectWindow.on('closed', () => {
    regionSelectWindow = null;
  });
  return regionSelectWindow;
}

async function startRegionSelection() {
  await ensureRegionSelectWindow();
  return { ok: true };
}

function stopRegionSelection() {
  if (regionSelectWindow && !regionSelectWindow.isDestroyed()) {
    regionSelectWindow.close();
  }
}

function buildSkillMarkdown({ title, description, body }) {
  const safeTitle = String(title || '').trim();
  const safeDescription = String(description || '').trim();
  const safeBody = String(body || '').trim();

  return [
    `# ${safeTitle || 'New skill'}`,
    '',
    safeDescription ? `> ${safeDescription}` : '> 在这里写一句说明，告诉 agent 这个 skill 是做什么的。',
    '',
    safeBody || '## 用法\n\n- 这里写技能说明。\n- 这里写步骤。\n',
  ].join('\n');
}

async function readSkillFile(sourcePath) {
  const contents = await fsp.readFile(sourcePath, 'utf8');
  const lines = contents.split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => line.startsWith('# '));
  const title = titleIndex >= 0 ? lines[titleIndex].replace(/^#\s+/, '').trim() : path.basename(path.dirname(sourcePath));
  const quotedIndex = lines.findIndex((line, index) => index > titleIndex && line.startsWith('> '));
  const descriptionIndex =
    quotedIndex >= 0
      ? quotedIndex
      : lines.findIndex((line, index) => index > titleIndex && line.trim().length > 0 && !line.startsWith('#'));
  const descriptionLine =
    descriptionIndex >= 0
      ? lines[descriptionIndex]
      : lines.find((line, index) => index > titleIndex && line.trim().length > 0 && !line.startsWith('#')) || '';
  const bodyStart = descriptionIndex >= 0 ? descriptionIndex + 1 : Math.max(titleIndex + 1, 0);
  const body = lines.slice(bodyStart).join('\n').trim();
  return {
    skillName: path.basename(path.dirname(sourcePath)),
    title,
    description: descriptionLine.replace(/^>\s+/, '').trim(),
    body,
    raw: contents,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: '#0b0d14',
    title: 'Skill Shell',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    if (process.env.SKILL_SHELL_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('scan-snapshot', async () => {
  return scanWorkspace();
});

ipcMain.handle('get-roots', async () => {
  return {
    claudeSkills: homePath('.claude', 'skills'),
    codexSkills: homePath('.codex', 'skills'),
    codexVendorSkills: homePath('.codex', 'vendor_imports', 'skills'),
    hermesSkills: homePath('.hermes', 'skills'),
    hermesAgentSkills: homePath('.hermes', 'hermes-agent', 'skills'),
  };
});

ipcMain.handle('open-path', async (_event, targetPath) => {
  if (!targetPath) return { ok: false };
  await shell.openPath(targetPath);
  return { ok: true };
});

ipcMain.handle('create-skill', async (_event, payload = {}) => {
  try {
    const agentId = payload.agentId;
    const skillName = safeSkillName(payload.skillName);
    const title = String(payload.title || skillName || 'New skill').trim();
    const description = String(payload.description || '').trim();
    const body = String(payload.body || '').trim();
    const root = getAgentRoot(agentId);

    if (!root) return { ok: false, error: '未知的 agent' };
    if (!skillName) return { ok: false, error: 'skill 名称不能为空' };

    const targetDir = path.join(root, skillName);
    const skillFile = path.join(targetDir, 'SKILL.md');
    await fsp.mkdir(targetDir, { recursive: true });

    if (await fsp
      .access(skillFile)
      .then(() => true)
      .catch(() => false)) {
      return { ok: false, error: '这个 skill 已经存在了' };
    }

    await fsp.writeFile(skillFile, buildSkillMarkdown({ title, description, body }), 'utf8');
    return { ok: true, path: skillFile };
  } catch (error) {
    return { ok: false, error: error.message || '创建失败' };
  }
});

ipcMain.handle('read-skill', async (_event, payload = {}) => {
  try {
    const sourcePath = payload.sourcePath;
    if (!sourcePath) return { ok: false, error: '缺少来源路径' };
    const data = await readSkillFile(sourcePath);
    return { ok: true, ...data };
  } catch (error) {
    return { ok: false, error: error.message || '读取失败' };
  }
});

ipcMain.handle('update-skill', async (_event, payload = {}) => {
  try {
    const sourcePath = payload.sourcePath;
    const skillName = safeSkillName(payload.skillName);
    const title = String(payload.title || skillName || 'New skill').trim();
    const description = String(payload.description || '').trim();
    const body = String(payload.body || '').trim();
    if (!sourcePath) return { ok: false, error: '缺少来源路径' };
    if (!skillName) return { ok: false, error: 'skill 名称不能为空' };

    const sourceDir = getSkillFolder(sourcePath);
    const parentDir = path.dirname(sourceDir);
    const nextDir = path.join(parentDir, skillName);
    const nextFile = path.join(nextDir, 'SKILL.md');

    if (sourceDir !== nextDir) {
      if (await fsp
        .access(nextDir)
        .then(() => true)
        .catch(() => false)) {
        return { ok: false, error: '这个名称已经被其他 skill 使用了' };
      }
      await fsp.rename(sourceDir, nextDir);
    } else {
      await fsp.mkdir(nextDir, { recursive: true });
    }

    await fsp.writeFile(nextFile, buildSkillMarkdown({ title, description, body }), 'utf8');
    return { ok: true, path: nextFile };
  } catch (error) {
    return { ok: false, error: error.message || '保存失败' };
  }
});

ipcMain.handle('translate-text', async (_event, payload = {}) => {
  try {
    const text = String(payload.text || '').trim();
    const source = String(payload.source || 'en').trim() || 'en';
    const target = String(payload.target || 'zh-CN').trim() || 'zh-CN';
    if (!text) return { ok: true, translatedText: '' };
    if (source === target || !isMostlyEnglish(text)) {
      return { ok: true, translatedText: text };
    }
    const offlineTarget = target.toLowerCase().startsWith('zh') ? 'zh' : target;
    const translatedText =
      (await translateTextOffline(text, source, offlineTarget)) ||
      (await translateText(text, source, target));
    return { ok: true, translatedText };
  } catch (error) {
    return { ok: false, error: error.message || '翻译失败' };
  }
});

ipcMain.handle('live-translate-toggle', async () => {
  return setLiveTranslationEnabled(!liveTranslateEnabled);
});

ipcMain.handle('live-translate-status', async () => {
  return {
    ok: true,
    enabled: liveTranslateEnabled,
    busy: liveTranslateBusy,
    lastLiveTranslation,
    region: liveTranslateRegion,
  };
});

ipcMain.handle('live-translate-region-start', async () => {
  return startRegionSelection();
});

ipcMain.handle('live-translate-region-set', async (_event, payload = {}) => {
  const region = payload?.region || null;
  if (!region) {
    return { ok: false, error: '缺少区域' };
  }
  liveTranslateRegion = region;
  stopRegionSelection();
  broadcastLiveStatus({ enabled: liveTranslateEnabled, state: liveTranslateEnabled ? 'translated' : 'idle', region: liveTranslateRegion });
  return { ok: true, region: liveTranslateRegion };
});

ipcMain.handle('live-translate-region-clear', async () => {
  liveTranslateRegion = null;
  broadcastLiveStatus({ enabled: liveTranslateEnabled, state: liveTranslateEnabled ? 'translated' : 'idle', region: null });
  return { ok: true };
});

ipcMain.handle('live-translate-once', async () => {
  try {
    const result = await translateSelectionOnce();
    return result;
  } catch (error) {
    return { ok: false, error: error.message || '翻译失败' };
  }
});

ipcMain.handle('rename-skill', async (_event, payload = {}) => {
  try {
    const sourcePath = payload.sourcePath;
    const newName = safeSkillName(payload.newName);
    if (!sourcePath) return { ok: false, error: '缺少来源路径' };
    if (!newName) return { ok: false, error: '新的 skill 名称不能为空' };

    const sourceDir = getSkillFolder(sourcePath);
    const parentDir = path.dirname(sourceDir);
    const nextDir = path.join(parentDir, newName);
    const nextFile = path.join(nextDir, 'SKILL.md');

    if (sourceDir === nextDir) return { ok: true, path: sourcePath };
    if (await fsp
      .access(nextDir)
      .then(() => true)
      .catch(() => false)) {
      return { ok: false, error: '新名称对应的 skill 已存在' };
    }

    await fsp.rename(sourceDir, nextDir);
    return { ok: true, path: nextFile };
  } catch (error) {
    return { ok: false, error: error.message || '重命名失败' };
  }
});

ipcMain.handle('delete-skill', async (_event, payload = {}) => {
  try {
    const sourcePath = payload.sourcePath;
    if (!sourcePath) return { ok: false, error: '缺少来源路径' };
    const folder = getSkillFolder(sourcePath);
    await fsp.rm(folder, { recursive: true, force: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || '删除失败' };
  }
});

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register('CommandOrControl+Shift+T', async () => {
    await setLiveTranslationEnabled(!liveTranslateEnabled);
  });
  globalShortcut.register('CommandOrControl+Shift+R', async () => {
    await startRegionSelection();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
