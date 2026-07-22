'use strict';

const {
  app, BaseWindow, BrowserWindow, WebContentsView,
  ipcMain, session, Menu, MenuItem,
  dialog, net, globalShortcut, shell, clipboard,
} = require('electron');
const path  = require('path');
const fs    = require('fs');
const Store = require('electron-store');

// ── userData path ─────────────────────────────────────────────────────────────
app.setPath('userData', path.join(app.getPath('appData'), 'unified-comms-next'));

const fetch               = require('cross-fetch');
const LicenseManager      = require('./license/license-manager');

// ── Performance flags ─────────────────────────────────────────────────────────
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// ── Corrupt store guard ───────────────────────────────────────────────────────
(function guardStore() {
  const candidates = [
    path.join(process.env.APPDATA || '', 'unified-comms-next', 'config.json'),
    path.join(process.env.HOME   || '', '.config', 'unified-comms-next', 'config.json'),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      const hasBOM = (buf[0]===0xEF&&buf[1]===0xBB&&buf[2]===0xBF)
                  || (buf[0]===0xFF&&buf[1]===0xFE)
                  || (buf[0]===0xFE&&buf[1]===0xFF);
      const raw = buf.toString('utf8').replace(/^\uFEFF/,'').trim();
      if (hasBOM || !raw.startsWith('{')) { fs.unlinkSync(p); continue; }
      JSON.parse(raw);
    } catch(e) {
      try { fs.unlinkSync(p); } catch(_) {}
    }
  }
})();

// ── Store ─────────────────────────────────────────────────────────────────────
function safeInitStore() {
  try { return new Store(); }
  catch(e) {
    const p = path.join(process.env.APPDATA||process.env.HOME||'', 'unified-comms-next', 'config.json');
    try { fs.unlinkSync(p); } catch(_) {}
    return new Store();
  }
}
const store = safeInitStore();

// ── Constants ─────────────────────────────────────────────────────────────────
const IS_DEV          = process.env.NODE_ENV === 'development';
const MAIN_PARTITION  = 'persist:main';
const CHROME_UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOAD_OPTIONS    = { extraHeaders: 'Accept-Language: en-US,en;q=0.9\n' };
const WEB_NOTIF_SVCS  = new Set(['telegram','slack','teams','whatsapp']);

// Preload that runs inside every service WebContentsView
function getUnpackedPath(rel) {
  if (app.isPackaged)
    return path.join(__dirname.replace('app.asar','app.asar.unpacked'), rel);
  return path.join(__dirname, rel);
}
const COMBINED_PRELOAD = getUnpackedPath('combined-preload.js');

// ── Global state ──────────────────────────────────────────────────────────────
let mainWindow       = null;
let uiView           = null;   // WebContentsView hosting the Next.js UI
let licenseManager   = null;

const views            = new Map();   // accountId → WebContentsView
const blockedSessions  = new Set();
let currentAccountId   = null;
let _dynTitleH         = 68;
let _dynSideW          = 64;

const overlayIconCache = new Map();
const titleUpdateTimers= new Map();
const viewLoadedOnce   = new Set();
const liveAccountNames = new Map();
const webNotifCount    = new Map();
const domBadgeLastCount= new Map();
const recentNotifKeys  = new Map();
const suppressedCounts = new Map();  // in-memory suppression cache

// Dedup helper
function isDuplicateNotif(key) {
  const now = Date.now();
  if (recentNotifKeys.has(key) && now - recentNotifKeys.get(key) < 3000) return true;
  recentNotifKeys.set(key, now);
  for (const [k, t] of recentNotifKeys) { if (now - t > 10000) recentNotifKeys.delete(k); }
  return false;
}
function getSuppressed(accountId) {
  return suppressedCounts.get(accountId) || store.get(`suppressedCounts.${accountId}`, 0);
}
function setSuppressed(accountId, count) {
  suppressedCounts.set(accountId, count);
  store.set(`suppressedCounts.${accountId}`, count);
}

const WEB_NOTIF_SERVICES = new Set(['telegram','slack','teams','whatsapp']);
const SERVICE_NAMES = {
  gmail:'Gmail', gchat:'Google Chat', slack:'Slack', teams:'Teams',
  telegram:'Telegram', discord:'Discord', whatsapp:'WhatsApp',
};

// Broadcast to both UI views (titlebar + sidebar share same state but separate instances)
function broadcastToUI(channel, data) {
  uiView?.webContents.send(channel, data);
  // sidebarView is in createWindow scope — access via global ref
  if (global._sidebarView && !global._sidebarView.webContents.isDestroyed()) {
    global._sidebarView.webContents.send(channel, data);
  }
}

// ── Layout helpers ────────────────────────────────────────────────────────────
function getViewBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return { x:0, y:0, width:1200, height:800 };
  const [w, h] = mainWindow.getContentSize();
  // w, h from getContentSize() are already in physical pixels on Windows
  return {
    x: _dynSideW,
    y: _dynTitleH,
    width:  Math.max(100, w - _dynSideW),
    height: Math.max(100, h - _dynTitleH),
  };
}

ipcMain.on('layout-dimensions', (_e, { titlebarHeight, sidebarWidth }) => {
  // Convert CSS pixels → physical pixels using the display scale factor
  const { screen } = require('electron');
  const scaleFactor = mainWindow
    ? screen.getDisplayMatching(mainWindow.getBounds()).scaleFactor
    : 1;
  _dynTitleH = Math.round((titlebarHeight || 68) * scaleFactor);
  _dynSideW  = Math.round((sidebarWidth  || 64) * scaleFactor);
  console.log(`[layout] CSS titleH=${titlebarHeight} sideW=${sidebarWidth} scale=${scaleFactor} → phys titleH=${_dynTitleH} sideW=${_dynSideW}`);
  if (currentAccountId && views.has(currentAccountId) && mainWindow && !mainWindow.isDestroyed())
    views.get(currentAccountId).setBounds(getViewBounds());
});

// ── Notification toast ────────────────────────────────────────────────────────
let toastWin = null;
let toastClickData = null;
function ensureToastWin() {
  if (toastWin && !toastWin.isDestroyed()) return;
  const { screen } = require('electron');
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  toastWin = new BrowserWindow({
    width: 360, height: 180,
    x: sw - 376, y: sh - 196,
    frame: false, transparent: false, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, focusable: false,
    backgroundColor: '#1e1f2e',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  const toastPath = path.join(__dirname, 'toast.html');
  toastWin.loadFile(toastPath);
  toastWin.setAlwaysOnTop(true, 'screen-saver');
  toastWin.on('closed', () => { toastWin = null; });
}

function showToast({ accountId, serviceLabel, sender, body, unreadCount }) {
  const serviceId   = (accountId || '').split('-')[0];
  const serviceName = SERVICE_NAMES[serviceId] || serviceLabel || serviceId;
  const iconPath    = `file:///${path.join(__dirname, '..', 'assets', 'icons', serviceId + '.svg').replace(/\\/g, '/')}`;
  let receiver = 'You';
  if (liveAccountNames.has(accountId)) receiver = liveAccountNames.get(accountId);
  toastClickData = { serviceId, accountId };
  ensureToastWin();
  const sendData = () => {
    if (!toastWin || toastWin.isDestroyed()) return;
    toastWin.webContents.send('toast-data', { iconPath, serviceName, sender, receiver, body, unreadCount });
    toastWin.show();
    toastWin.setAlwaysOnTop(true, 'screen-saver');
  };
  if (toastWin.webContents.isLoading()) toastWin.webContents.once('did-finish-load', sendData);
  else sendData();
}

ipcMain.on('toast-clicked', () => {
  if (toastClickData) {
    mainWindow?.show(); mainWindow?.focus();
    uiView?.webContents.send('focus-service', toastClickData.accountId);
  }
  if (toastWin && !toastWin.isDestroyed()) toastWin.hide();
});
ipcMain.handle('create-view', async (_e, { accountId, url, partition, forceReload }) => {
  // Teams extra accounts: redirect to MS account picker
  if (accountId.startsWith('teams-') && !accountId.endsWith('-1') && !views.has(accountId))
    url = 'https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=13&wp=MBI_SSL&wreply=https%3A%2F%2Fteams.live.com%2F&id=293290&prompt=select_account';

  if (views.has(accountId)) {
    if (forceReload) views.get(accountId).webContents.loadURL(url, LOAD_OPTIONS).catch(()=>{});
    return { success: true };
  }

  const ses = session.fromPartition(partition);
  ses.setUserAgent(CHROME_UA, 'en-US,en');
  startNetworkMonitor._attachToSession?.(ses);

  // Grant notification permission
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(true));

  // Google extra accounts — spoof headers so login works in embedded view
  const isGoogleExtra = (accountId.startsWith('gmail-')||accountId.startsWith('gchat-'))
    && !accountId.endsWith('-1');
  if (isGoogleExtra) {
    ses.webRequest.onBeforeSendHeaders(
      { urls: ['https://*.google.com/*','https://accounts.google.com/*'] },
      (details, cb) => {
        const h = details.requestHeaders;
        delete h['X-Electron'];
        h['sec-ch-ua'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
        h['sec-ch-ua-mobile'] = '?0';
        h['sec-ch-ua-platform'] = '"Windows"';
        h['User-Agent'] = CHROME_UA;
        h['Sec-Fetch-Site'] = 'none';
        h['Sec-Fetch-Mode'] = 'navigate';
        h['Sec-Fetch-Dest'] = 'document';
        cb({ requestHeaders: h });
      }
    );
  }

  const serviceId = accountId.split('-')[0];

  const view = new WebContentsView({
    webPreferences: {
      partition,
      preload: COMBINED_PRELOAD,
      nodeIntegration: false,
      contextIsolation: false,
      backgroundThrottling: false,
      spellcheck: true,
    },
  });

  // Don't add to contentView yet — added on first switch-view call
  views.set(accountId, view);
  // Title-based badge count detection with full suppression and toast support
  let lastTitleCount = 0;
  view.webContents.on('page-title-updated', (_e2, title) => {
    clearTimeout(titleUpdateTimers.get(accountId));
    titleUpdateTimers.set(accountId, setTimeout(() => {
      const patterns = [/^\((\d+)\)/, /\((\d+)\)\s*[-|]/, /\((\d+)\)\s*$/, /^\*(\d+)\*/, /\[(\d+)\]/];
      let count = 0;
      for (const p of patterns) { const m = title.match(p); if (m) { count = parseInt(m[1]); break; } }
      const suppressed = getSuppressed(accountId);
      const effective  = count > suppressed ? count : 0;
      broadcastToUI('badge-count', { accountId, count: effective });
      const windowFocused = mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused();
      const userReading   = (currentAccountId === accountId) && windowFocused;
      if (count > lastTitleCount && count > suppressed && !userReading && !WEB_NOTIF_SERVICES.has(serviceId)) {        const key = `${accountId}-title-${count}`;
        if (!isDuplicateNotif(key)) {
          const label = serviceId.charAt(0).toUpperCase() + serviceId.slice(1);
          showToast({ accountId, serviceLabel: label, sender: null, body: `${effective} unread message${effective>1?'s':''}`, unreadCount: effective });
        }
      }
      lastTitleCount = count;
    }, 200));
  });

  view.webContents.on('did-finish-load', () => {
    viewLoadedOnce.add(accountId);
    view.webContents.send('view-visibility', { visible: currentAccountId === accountId });
    // Discord: patch SW notification forwarding
    if (serviceId === 'discord') {
      view.webContents.executeJavaScript(`
        (function() {
          if (window.__discordNotifPatched) return;
          window.__discordNotifPatched = true;
          function fwd(title, options) {
            try { require('electron').ipcRenderer.send('web-notification', { title: title||'', body: (options&&options.body)||'', icon:'' }); } catch(e) {}
          }
          try { ServiceWorkerRegistration.prototype.showNotification = fwd; } catch(e) {}
          if (navigator.serviceWorker) {
            navigator.serviceWorker.addEventListener('message', function(ev) {
              const d = ev.data; if (!d) return;
              const t = d.title||(d.notification&&d.notification.title)||'';
              const b = d.body||(d.notification&&d.notification.body)||'';
              if (t) fwd(t, { body: b });
            });
            navigator.serviceWorker.ready.then(reg => { reg.showNotification = fwd; }).catch(()=>{});
          }
        })();
      `).catch(()=>{});
    }
  });

  attachServiceContextMenu(view);

  view.webContents.setWindowOpenHandler(({ url: newUrl }) => {
    if (newUrl.includes('login.microsoftonline.com') || newUrl.includes('login.live.com') || newUrl.includes('accounts.google.com')) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 600, height: 700, parent: mainWindow, webPreferences: { partition, nodeIntegration: false, contextIsolation: true } } };
    }
    shell.openExternal(newUrl).catch(()=>{});
    return { action: 'deny' };
  });

  view.webContents.loadURL(url, LOAD_OPTIONS).catch(()=>{});
  return { success: true };
});

// ── Switch / destroy views ────────────────────────────────────────────────────
ipcMain.handle('switch-view', (_e, { accountId }) => {
  if (!views.has(accountId)) return { success: false };

  // Hide all other views by removing them from contentView
  for (const [id, v] of views) {
    if (id !== accountId) {
      try { mainWindow.contentView.removeChildView(v); } catch(_) {}
      v.webContents.send('view-visibility', { visible: false });
      v.webContents.executeJavaScript(`(function(){try{
        Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});
        Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});
        document.dispatchEvent(new Event('visibilitychange'));
      }catch(e){}})();`).catch(()=>{});
    }
  }

  const targetView = views.get(accountId);

  // Just add the service view — it goes into content area which has zero overlap
  // with titlebarView or sidebarView strips
  try { mainWindow.contentView.removeChildView(targetView); } catch(_) {}
  mainWindow.contentView.addChildView(targetView);

  const bounds = getViewBounds();
  console.log(`[switch-view] ${accountId} bounds=${JSON.stringify(bounds)}`);
  targetView.setBounds(bounds);

  targetView.webContents.send('view-visibility', { visible: true });
  targetView.webContents.executeJavaScript(`(function(){try{
    Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});
    Object.defineProperty(document,'visibilityState',{get:()=>'visible',configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
  }catch(e){}})();`).catch(()=>{});

  currentAccountId = accountId;
  return { success: true };
});

ipcMain.handle('destroy-view', (_e, { accountId }) => {
  const v = views.get(accountId);
  if (!v) return { success: false };
  mainWindow.contentView.removeChildView(v);
  v.webContents.close();
  views.delete(accountId);
  if (currentAccountId === accountId) currentAccountId = null;
  return { success: true };
});

ipcMain.handle('reload-view', (_e, { accountId }) => {
  const v = views.get(accountId);
  if (v && !v.webContents.isDestroyed()) v.webContents.reload();
  return { success: true };
});

// ── Notification IPC ──────────────────────────────────────────────────────────
ipcMain.on('web-notification', (_e, { title, body }) => {
  const svc = [...views.entries()].find(([,v]) => v.webContents.id === _e.sender.id);
  if (!svc) return;
  const [accountId] = svc;
  const serviceId = accountId.split('-')[0];
  if (WEB_NOTIF_SERVICES.has(serviceId) && serviceId !== 'discord') return;
  const windowFocused = mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused();
  if (accountId === currentAccountId && windowFocused) return;
  const dedupKey = `${accountId}-webnotif-${title}-${body}`;
  if (isDuplicateNotif(dedupKey)) return;
  const prev = webNotifCount.get(accountId) || 0;
  webNotifCount.set(accountId, prev + 1);
  const label = serviceId.charAt(0).toUpperCase() + serviceId.slice(1);
  let sender = null;
  const m = title.match(/^([^:]+):/);
  if (m) sender = m[1].trim(); else sender = title || null;
  showToast({ accountId, serviceLabel: label, sender, body: body || '', unreadCount: prev + 1 });
  broadcastToUI('badge-count', { accountId, count: -1 }); // -1 = bump dot
});

ipcMain.on('dom-badge-count', (_e, { count, sender, body }) => {
  const svc = [...views.entries()].find(([,v]) => v.webContents.id === _e.sender.id);
  if (!svc) return;
  const [accountId] = svc;
  const serviceId = accountId.split('-')[0];
  const suppressed = getSuppressed(accountId);
  const effective  = count > suppressed ? count : 0;
  broadcastToUI('badge-count', { accountId, count: effective });
  const windowFocused = mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused();
  const userReading   = (accountId === currentAccountId) && windowFocused;
  const last = domBadgeLastCount.get(accountId) || 0;
  if (count > last && count > suppressed && !userReading) {
    const skipDomToast = WEB_NOTIF_SERVICES.has(serviceId) && serviceId !== 'discord';
    if (!skipDomToast) {
      const key = `${accountId}-dom-${count}`;
      if (!isDuplicateNotif(key)) {
        const label = serviceId.charAt(0).toUpperCase() + serviceId.slice(1);
        const toastBody = body || (sender ? 'New message' : `${effective} unread message${effective>1?'s':''}`);
        showToast({ accountId, serviceLabel: label, sender: sender||null, body: toastBody, unreadCount: effective });
      }
    }
  }
  domBadgeLastCount.set(accountId, count);
});

ipcMain.on('suppress-badge', (_e, { accountId, count }) => {
  setSuppressed(accountId, count);
  domBadgeLastCount.set(accountId, count);
  broadcastToUI('badge-count', { accountId, count: 0 });
});

ipcMain.on('discord-username-detected', (_e, { name }) => {
  let accountId = null;
  for (const [id, v] of views.entries()) {
    if (!v.webContents.isDestroyed() && v.webContents.id === _e.sender.id) { accountId = id; break; }
  }
  if (accountId) liveAccountNames.set(accountId, name);
});

ipcMain.on('service-username-detected', (_e, { name }) => {
  let accountId = null;
  for (const [id, v] of views.entries()) {
    if (!v.webContents.isDestroyed() && v.webContents.id === _e.sender.id) { accountId = id; break; }
  }
  if (accountId) liveAccountNames.set(accountId, name);
});

// ── Settings / Services IPC ───────────────────────────────────────────────────
ipcMain.handle('get-settings',         () => store.get('settings', {}));
ipcMain.handle('save-settings',   (_e, s) => { store.set('settings', s); return { success: true }; });
ipcMain.handle('get-user-services',    () => store.get('userServices', []));
ipcMain.handle('save-user-services',(_e,s) => { store.set('userServices', s); return { success: true }; });
ipcMain.handle('get-sidebar-order',    () => store.get('sidebarOrder', null));
ipcMain.handle('save-sidebar-order',(_e,o) => { store.set('sidebarOrder', o); return { success: true }; });

ipcMain.handle('clear-cache', async (_e, partition) => {
  const ses = session.fromPartition(partition || MAIN_PARTITION);
  await ses.clearCache();
  try { await ses.clearStorageData({ storages: ['cachestorage'] }); } catch(_) {}
  return { success: true };
});

ipcMain.handle('remove-service-data', async (_e, { accountId, partition: p }) => {
  if (views.has(accountId)) {
    const v = views.get(accountId);
    try { v.webContents.stop(); mainWindow.contentView.removeChildView(v); } catch(_) {}
    views.delete(accountId);
    if (currentAccountId === accountId) currentAccountId = null;
  }
  if (p) {
    const ses = session.fromPartition(p);
    await ses.clearStorageData();
    await ses.clearCache();
    try { await ses.clearCodeCaches(); } catch(_) {}
  }
  return { success: true };
});

ipcMain.handle('fetch-favicon', async (_e, { url }) => {
  try {
    const { hostname } = new URL(url);
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') || 'image/png';
      return { dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
    }
  } catch(_) {}
  return { dataUrl: null };
});

ipcMain.handle('pick-icon-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Icon',
    filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','gif','webp','svg','ico'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return { dataUrl: null };
  try {
    const buf = fs.readFileSync(result.filePaths[0]);
    const ext = path.extname(result.filePaths[0]).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'ico' ? 'image/x-icon' : `image/${ext}`;
    return { dataUrl: `data:${mime};base64,${buf.toString('base64')}` };
  } catch(_) { return { dataUrl: null }; }
});

ipcMain.handle('scan-junk-userdata', async () => {
  const userData = app.getPath('userData');
  const results = { files: [], dirs: [], totalBytes: 0 };
  const junkFilePatterns = [/^google-spoof-persist_.*\.js$/, /^ms-spoof-.*\.js$/, /^wa-spoof.*\.js$/];
  const cacheDirs = ['Cache', 'Code Cache', 'blob_storage', 'Shared Dictionary'];
  try {
    const entries = fs.readdirSync(userData, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(userData, entry.name);
      if (entry.isFile() && junkFilePatterns.some(p => p.test(entry.name))) {
        const size = fs.statSync(fullPath).size;
        results.files.push({ path: fullPath, name: entry.name, size });
        results.totalBytes += size;
      } else if (entry.isDirectory() && cacheDirs.includes(entry.name)) {
        results.dirs.push({ path: fullPath, name: entry.name, isCache: true });
      }
    }
  } catch(_) {}
  return results;
});

ipcMain.handle('delete-junk-userdata', async (_e, { files, dirs }) => {
  let deleted = 0;
  for (const f of (files||[])) { try { fs.unlinkSync(f.path); deleted++; } catch(_) {} }
  for (const d of (dirs||[])) { try { fs.rmSync(d.path, { recursive: true, force: true }); deleted++; } catch(_) {} }
  return { deleted };
});

ipcMain.handle('backup-data', async (_e, { serviceIds } = {}) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose backup destination folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (canceled || !filePaths[0]) return { canceled: true };
  const userData = app.getPath('userData');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = path.join(filePaths[0], `unified-comms-backup-${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });
  try {
    const configSrc = path.join(userData, 'config.json');
    if (fs.existsSync(configSrc)) fs.copyFileSync(configSrc, path.join(backupDir, 'config.json'));
    const allServices = store.get('userServices', []);
    const services = serviceIds ? allServices.filter(s => serviceIds.includes(s.id)) : allServices;
    const partitionsDir = path.join(userData, 'Partitions');
    const backedUp = [];
    for (const svc of services) {
      const src = path.join(partitionsDir, svc.id);
      if (fs.existsSync(src)) {
        const dest = path.join(backupDir, 'Partitions', svc.id);
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
          try { if (entry.isFile()) fs.copyFileSync(path.join(src, entry.name), path.join(dest, entry.name)); } catch(_) {}
        }
        backedUp.push(svc.name || svc.id);
      }
    }
    const manifest = { services: services.map(s => ({ id: s.id, name: s.name })) };
    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest));
    return { success: true, backupDir, services: backedUp };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('restore-data-scan', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select backup folder', properties: ['openDirectory'],
  });
  if (canceled || !filePaths[0]) return { canceled: true };
  const backupDir = filePaths[0];
  if (!fs.existsSync(path.join(backupDir, 'config.json')))
    return { success: false, error: 'Not a valid backup folder (config.json missing).' };
  let services = [];
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try { const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); services = m.services || []; } catch(_) {}
  }
  return { success: true, backupDir, services };
});

ipcMain.handle('restore-data', async (_e, { backupDir, serviceIds } = {}) => {
  if (!backupDir) return { success: false, error: 'No backup directory.' };
  const stagingPath = path.join(app.getPath('userData'), 'pending-restore.json');
  fs.writeFileSync(stagingPath, JSON.stringify({ backupDir, serviceIds: serviceIds || null }));
  app.relaunch(); app.exit(0);
  return { success: true };
});

ipcMain.handle('relaunch-app', () => { app.relaunch(); app.exit(0); });

ipcMain.on('open-external-url', (_e, { url }) => shell.openExternal(url).catch(()=>{}));

// Show/hide service off-page — broadcast to both UI views
ipcMain.on('show-off-page', (_e, { serviceId }) => {
  broadcastToUI('show-off-page', { serviceId });
});

// Off-page open/close — expand titlebarView to cover content area only (sidebar stays visible)
ipcMain.on('off-page-open', () => {
  if (!mainWindow || !uiView) return;
  const [w, h] = mainWindow.getContentSize();
  const sw = w>200?w:1400, sh = h>200?h:900;
  // Expand titlebarView to cover content area only
  uiView.setBounds({ x: _dynSideW, y: _dynTitleH, width: sw - _dynSideW, height: sh - _dynTitleH });
  // Re-stack: titlebarView (off-page) then sidebarView on top so sidebar stays visible
  try { mainWindow.contentView.removeChildView(uiView); } catch(_) {}
  try { mainWindow.contentView.removeChildView(global._sidebarView); } catch(_) {}
  mainWindow.contentView.addChildView(uiView);
  if (global._sidebarView && !global._sidebarView.webContents.isDestroyed()) {
    // Reset sidebarView to full height (x:0, y:titlebarH, w:sidebarW, h:rest)
    global._sidebarView.setBounds({ x:0, y:_dynTitleH, width:_dynSideW, height: sh - _dynTitleH });
    mainWindow.contentView.addChildView(global._sidebarView);
  }
});
ipcMain.on('off-page-close', () => {
  if (!mainWindow || !uiView) return;
  const sw = mainWindow.getContentSize()[0];
  // Shrink back to titlebar strip
  uiView.setBounds({ x:0, y:0, width: sw>200?sw:1400, height: _dynTitleH });
});;

// Context menu open/close — expand sidebarView so menu appears over service view
ipcMain.on('context-menu-open', () => {  if (!mainWindow || !global._sidebarView) return;
  const [w, h] = mainWindow.getContentSize();
  const sw = w>200?w:1400, sh = h>200?h:900;
  global._sidebarView.setBounds({ x:0, y:_dynTitleH, width:sw, height:sh - _dynTitleH });
  try { mainWindow.contentView.removeChildView(global._sidebarView); } catch(_) {}
  mainWindow.contentView.addChildView(global._sidebarView);
});
ipcMain.on('context-menu-close', () => {
  if (!mainWindow || !global._sidebarView) return;
  const [, h] = mainWindow.getContentSize();
  const sh = h>200?h:900;
  global._sidebarView.setBounds({ x:0, y:_dynTitleH, width:_dynSideW, height:sh - _dynTitleH });
});

// Modal open/close — expand/shrink titlebarView to cover full window for modals
ipcMain.on('modal-open', () => {
  if (!mainWindow || !uiView) return;
  const [w, h] = mainWindow.getContentSize();
  const sw = w>200?w:1400, sh = h>200?h:900;
  uiView.setBounds({ x:0, y:0, width:sw, height:sh });
  try { mainWindow.contentView.removeChildView(uiView); } catch(_) {}
  mainWindow.contentView.addChildView(uiView);
});
ipcMain.on('modal-close', () => {
  if (!mainWindow || !uiView) return;
  const [, h] = mainWindow.getContentSize();
  const sh = h>200?h:900;
  uiView.setBounds({ x:0, y:0, width: mainWindow.getContentSize()[0]>200 ? mainWindow.getContentSize()[0] : 1400, height: _dynTitleH });
});

ipcMain.on('toggle-service-on', (_e, { serviceId }) => {
  const settings = store.get('settings', {});
  const disabled = new Set(settings.disabledServices || []);
  disabled.delete(serviceId);
  settings.disabledServices = [...disabled];
  store.set('settings', settings);
  uiView?.webContents.send('service-toggled', { serviceId, enabled: true });
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => { mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize(); });
ipcMain.on('window-close',    () => app.exit(0));

// ── License IPC ───────────────────────────────────────────────────────────────
ipcMain.handle('get-license-info',    () => licenseManager.getLicenseInfo());
ipcMain.handle('activate-license', (_e, filePath) => licenseManager.activateFromFile(filePath));
ipcMain.handle('deactivate-license',  () => licenseManager.deactivate());
ipcMain.handle('select-license-file', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Select License File', filters: [{ name:'License',extensions:['key','json'] }], properties:['openFile'],
  });
  if (r.canceled || !r.filePaths.length) return { success: false, error: 'Cancelled' };
  return licenseManager.activateFromFile(r.filePaths[0]);
});

// ── Context menu for service views ────────────────────────────────────────────
function attachServiceContextMenu(view) {
  view.webContents.on('context-menu', (_e, p) => {
    const items = [];
    if (p.linkURL) {
      items.push(new MenuItem({ label:'Open link in browser', click:()=>shell.openExternal(p.linkURL).catch(()=>{}) }));
      items.push(new MenuItem({ label:'Copy link address',    click:()=>clipboard.writeText(p.linkURL) }));
      items.push(new MenuItem({ type:'separator' }));
    }
    if (p.mediaType==='image'&&p.srcURL) {
      items.push(new MenuItem({ label:'Open image in browser', click:()=>shell.openExternal(p.srcURL).catch(()=>{}) }));
      items.push(new MenuItem({ label:'Copy image address',    click:()=>clipboard.writeText(p.srcURL) }));
      items.push(new MenuItem({ type:'separator' }));
    }
    if (p.selectionText?.trim()) {
      items.push(new MenuItem({ label:'Copy', role:'copy' }));
      items.push(new MenuItem({ label:`Search Google for "${p.selectionText.trim().slice(0,30)}"`, click:()=>shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(p.selectionText.trim())}`).catch(()=>{}) }));
      items.push(new MenuItem({ type:'separator' }));
    }
    if (p.isEditable) {
      items.push(new MenuItem({ label:'Cut',   role:'cut' }));
      items.push(new MenuItem({ label:'Copy',  role:'copy' }));
      items.push(new MenuItem({ label:'Paste', role:'paste' }));
      items.push(new MenuItem({ type:'separator' }));
    }
    items.push(new MenuItem({ label:'Reload', click:()=>{ if(!view.webContents.isDestroyed()) view.webContents.reload(); } }));
    items.push(new MenuItem({ label:'Back',    enabled: view.webContents.canGoBack(),    click:()=>view.webContents.goBack() }));
    items.push(new MenuItem({ label:'Forward', enabled: view.webContents.canGoForward(), click:()=>view.webContents.goForward() }));
    if (!items.length) return;
    const m = new Menu();
    items.forEach(i => m.append(i));
    m.popup({ window: mainWindow });
  });
}

// ── Memory monitoring ─────────────────────────────────────────────────────────
function startMemoryMonitor() {
  async function collectAndSend() {
    try {
      const allMetrics = await app.getAppMetrics();
      let totalKB = 0;
      for (const proc of allMetrics) totalKB += proc.memory?.workingSetSize || 0;
      const mainRss = Math.round(process.memoryUsage().rss / 1024);
      const mb = Math.round(Math.max(totalKB, mainRss) / 1024);
      const settings = store.get('settings', {});
      if (settings.memoryLimit && mb > settings.memoryLimit) {
        try { session.fromPartition(MAIN_PARTITION).clearCodeCaches(); } catch(_) {}
      }
      uiView?.webContents.send('memory-update', { mb });
    } catch(_) {
      const mb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      uiView?.webContents.send('memory-update', { mb });
    }
  }
  collectAndSend();
  setInterval(collectAndSend, 5000);
}

// ── Network monitoring ────────────────────────────────────────────────────────
function startNetworkMonitor() {
  let pendingBytes = 0;
  function attachToSession(ses) {
    try {
      ses.webRequest.onCompleted((details) => {
        if (details.fromCache) return;
        const len = details.transferSize || parseInt(details.responseHeaders?.['content-length']?.[0] || '0');
        if (!isNaN(len) && len > 0) pendingBytes += len;
      });
    } catch(_) {}
  }
  attachToSession(session.fromPartition(MAIN_PARTITION));
  startNetworkMonitor._attachToSession = attachToSession;

  setInterval(() => {
    try {
      const online = net.isOnline?.() ?? true;
      const bytes = pendingBytes;
      pendingBytes = 0;
      const mbps = parseFloat(((bytes * 8) / 2_000_000).toFixed(2)); // 2s interval
      uiView?.webContents.send('network-update', { online, mbps });
    } catch(_) {}
  }, 2000);
}

// ── Create main window ────────────────────────────────────────────────────────
async function createWindow() {
  const mainSes = session.fromPartition(MAIN_PARTITION);
  mainSes.setUserAgent(CHROME_UA);

  mainWindow = new BaseWindow({
    width: 1400, height: 900,
    frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#0d0d12',
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
  });
  try { mainWindow.setIcon(path.join(__dirname,'..','assets','icon.ico')); } catch(_) {}

  // ── View architecture ───────────────────────────────────────────────────────
  // bgView  : full window, animated particle background
  // svcView : added/removed per service switch, bounds = content area only
  // uiView  : full-window Next.js UI, ALWAYS added LAST (on top)
  //
  // Key insight: uiView IS on top of svcView. Clicks on svcView area ARE blocked
  // by uiView. Solution: set uiView bounds to ONLY the titlebar+sidebar strips.
  // Then svcView receives clicks in the content area with zero overlap.
  //
  // uiView bounds:  x:0, y:0, w:fullWidth, h:fullHeight  (but we clip it)
  // Actually: we use TWO views for the UI:
  //   - titlebarView: x:0, y:0, w:fullWidth, h:titlebarH
  //   - sidebarView:  x:0, y:titlebarH, w:sidebarW, h:(fullHeight-titlebarH)
  // This way NO overlap with service view ever occurs.
  // ───────────────────────────────────────────────────────────────────────────

  // Background canvas — bottom layer
  const bgView = new WebContentsView({ webPreferences: { partition: MAIN_PARTITION } });
  bgView.setBackgroundColor('#0e0f1a');
  mainWindow.contentView.addChildView(bgView);
  bgView.webContents.loadFile(path.join(__dirname, 'bg.html'));

  // uiView — full-window transparent view, loads the Next.js app
  // It is ALWAYS the LAST child (on top). Since it's transparent, the service view
  // below shows through in the content area. The Titlebar/Sidebar components in
  // React have opaque backgrounds so they are visible. The content area div has
  // no background and pointer-events:none so the service view handles those clicks.
  // Electron's WebContents click handling: uiView IS on top. Clicks on the content
  // area DIV (pointer-events:none) bubble up and... are still consumed by uiView's
  // WebContents frame. To truly forward clicks we need a different approach.
  //
  // FINAL SOLUTION: Instead of one full-window uiView, use two strip-only views
  // that NEVER overlap with the service view:
  //   titlebarView: x:0,    y:0,       w:full, h:titlebarH
  //   sidebarView:  x:0,    y:titleH,  w:sideW, h:rest
  // Service view:   x:sideW, y:titleH, w:rest,  h:rest
  // ZERO overlap → no click interception issues.
  //
  // Both views load the SAME Next.js page (same partition = shared session/state).

  const uiPrefs = {
    preload: path.join(__dirname, 'preload.js'),
    nodeIntegration: false,
    contextIsolation: true,
    partition: MAIN_PARTITION,
    backgroundThrottling: false,
  };

  // titlebarView — top strip
  uiView = new WebContentsView({ webPreferences: uiPrefs });
  uiView.setBackgroundColor('#0d0d12');
  mainWindow.contentView.addChildView(uiView);

  // sidebarView — left strip (below titlebar)
  // Uses a separate preload that sets window.__VIEW_TYPE = 'sidebar'
  const sidebarPreloadPath = path.join(__dirname, 'preload.js');
  const sidebarView = new WebContentsView({
    webPreferences: { ...uiPrefs, additionalArguments: ['--view-type=sidebar'] }
  });
  sidebarView.setBackgroundColor('#0d0d12');
  mainWindow.contentView.addChildView(sidebarView);
  global._sidebarView = sidebarView;

  function resizeViews() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [w, h] = mainWindow.getContentSize();
    const sw = w>200?w:1400, sh = h>200?h:900;
    const tH = _dynTitleH, sW = _dynSideW;
    bgView.setBounds({ x:0, y:0, width:sw, height:sh });
    // Titlebar strip: full width, top
    uiView.setBounds({ x:0, y:0, width:sw, height:tH });
    // Sidebar strip: sidebar width, below titlebar
    sidebarView.setBounds({ x:0, y:tH, width:sW, height:sh - tH });
    // Service view: content area (no overlap with either strip)
    if (currentAccountId && views.has(currentAccountId)) {
      views.get(currentAccountId).setBounds(getViewBounds());
    }
  }
  resizeViews();
  mainWindow.show();

  let resizeTimer = null;
  mainWindow.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeViews();
      const [w,h] = mainWindow.getContentSize();
      uiView.webContents.send('window-resized', { width:w, height:h });
      sidebarView.webContents.send('window-resized', { width:w, height:h });
    }, 16);
  });
  mainWindow.on('maximize',   () => { resizeViews(); const [w,h]=mainWindow.getContentSize(); uiView.webContents.send('window-resized',{width:w,height:h}); sidebarView.webContents.send('window-resized',{width:w,height:h}); });
  mainWindow.on('unmaximize', () => { resizeViews(); const [w,h]=mainWindow.getContentSize(); uiView.webContents.send('window-resized',{width:w,height:h}); sidebarView.webContents.send('window-resized',{width:w,height:h}); });

  // Load Next.js in both strips with view type as query param
  const port = process.env.NEXT_DEV_PORT || '3000';
  if (IS_DEV) {
    uiView.webContents.loadURL(`http://localhost:${port}/?view=titlebar`);
    sidebarView.webContents.loadURL(`http://localhost:${port}/?view=sidebar`);
  } else {
    uiView.webContents.loadFile(path.join(__dirname, '..', 'out', 'index.html'), { query: { view: 'titlebar' } });
    sidebarView.webContents.loadFile(path.join(__dirname, '..', 'out', 'index.html'), { query: { view: 'sidebar' } });
  }

  uiView.webContents.on('console-message', (_e, level, msg) => {
    console.log(`[UI:${level}]`, msg.substring(0, 400));
  });
  uiView.webContents.on('did-finish-load', () => {
    console.log('[UIView] loaded:', uiView.webContents.getURL());
  });
  sidebarView.webContents.on('console-message', (_e, level, msg) => {
    console.log(`[SIDEBAR:${level}]`, msg.substring(0, 400));
  });
  sidebarView.webContents.on('did-finish-load', () => {
    console.log('[SidebarView] loaded:', sidebarView.webContents.getURL());
  });
  uiView.webContents.on('before-input-event', (_e, input) => {
    if (input.key==='F12'&&input.type==='keyDown') {
      currentAccountId && views.has(currentAccountId)
        ? views.get(currentAccountId).webContents.openDevTools({ mode:'detach' })
        : uiView.webContents.openDevTools({ mode:'detach' });
    }
  });

  mainWindow.on('closed', () => { mainWindow=null; uiView=null; app.exit(0); });
  mainWindow.on('system-context-menu', e => e.preventDefault());

  startMemoryMonitor();
  startNetworkMonitor();
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
process.on('uncaughtException',  e => console.error('[Main] uncaughtException:', e.message));
process.on('unhandledRejection', r => console.error('[Main] unhandledRejection:', r));
app.on('render-process-gone', (_e, _wc, d) => console.error('[Main] renderer gone:', d.reason));

app.whenReady().then(async () => {
  licenseManager = new LicenseManager();
  await licenseManager.initialize();

  // ── Splash screen ──────────────────────────────────────────────────────────
  const splashWin = new BrowserWindow({
    width: 480, height: 300,
    frame: false, transparent: false,
    backgroundColor: '#0d0d1a',
    resizable: false, center: true, show: false,
    skipTaskbar: true, alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
  });

  const splashHtmlPath = path.join(__dirname, 'splash.html');
  if (fs.existsSync(splashHtmlPath)) {
    splashWin.loadFile(splashHtmlPath);
    splashWin.once('ready-to-show', () => splashWin.show());
    await new Promise(resolve => {
      ipcMain.once('splash-done', resolve);
      setTimeout(resolve, 3000); // auto-dismiss after 3s
    });
  }
  if (!splashWin.isDestroyed()) splashWin.close();
  // ──────────────────────────────────────────────────────────────────────────

  await createWindow();

  // Keyboard shortcuts
  globalShortcut.register('CommandOrControl+,', () => {
    uiView?.webContents.send('open-settings');
  });
  globalShortcut.register('F12', () => {
    if (currentAccountId && views.has(currentAccountId))
      views.get(currentAccountId).webContents.openDevTools({ mode: 'detach' });
    else uiView?.webContents.openDevTools({ mode: 'detach' });
  });
  // Ctrl+1-9: switch to service by position
  for (let i = 1; i <= 9; i++) {
    const n = i;
    globalShortcut.register(`CommandOrControl+${n}`, () => {
      const services = store.get('userServices', []);
      const svc = services[n - 1];
      if (svc) uiView?.webContents.send('switch-to-service', { accountId: svc.id });
    });
  }

  // Check license
  const info = licenseManager.getLicenseInfo();
  if (!info.hasLicense && !info.inTrial) {
    await licenseManager.showLicenseDialog(null);
  }
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform!=='darwin') app.quit(); });
app.on('activate', () => { if (BaseWindow.getAllWindows().length===0) createWindow(); });
