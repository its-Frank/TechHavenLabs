'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Detect which view type this is via command line args passed by main.js
const isSidebar = process.argv.includes('--view-type=sidebar');

contextBridge.exposeInMainWorld('__VIEW_TYPE__', isSidebar ? 'sidebar' : 'titlebar');

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Views ──────────────────────────────────────────────────────────────────
  createView:  (args)   => ipcRenderer.invoke('create-view',  args),
  switchView:  (args)   => ipcRenderer.invoke('switch-view',  args),
  destroyView: (args)   => ipcRenderer.invoke('destroy-view', args),
  reloadView:  (args)   => ipcRenderer.invoke('reload-view',  args),

  // ── Services / Settings ────────────────────────────────────────────────────
  getSettings:       ()  => ipcRenderer.invoke('get-settings'),
  saveSettings:      (s) => ipcRenderer.invoke('save-settings', s),
  getUserServices:   ()  => ipcRenderer.invoke('get-user-services'),
  saveUserServices:  (s) => ipcRenderer.invoke('save-user-services', s),
  getSidebarOrder:   ()  => ipcRenderer.invoke('get-sidebar-order'),
  saveSidebarOrder:  (o) => ipcRenderer.invoke('save-sidebar-order', o),
  clearCache:        (p) => ipcRenderer.invoke('clear-cache', p),
  removeServiceData: (a) => ipcRenderer.invoke('remove-service-data', a),
  fetchFavicon:      (a) => ipcRenderer.invoke('fetch-favicon', a),
  pickIconFile:      ()  => ipcRenderer.invoke('pick-icon-file'),

  // ── Data backup/restore ────────────────────────────────────────────────────
  scanJunkUserdata:    ()  => ipcRenderer.invoke('scan-junk-userdata'),
  deleteJunkUserdata:  (a) => ipcRenderer.invoke('delete-junk-userdata', a),
  backupData:          (a) => ipcRenderer.invoke('backup-data', a),
  restoreDataScan:     ()  => ipcRenderer.invoke('restore-data-scan'),
  restoreData:         (a) => ipcRenderer.invoke('restore-data', a),
  relunchApp:          ()  => ipcRenderer.invoke('relaunch-app'),

  // ── Blocking ───────────────────────────────────────────────────────────────
  // (blocking features removed)

  // ── License ────────────────────────────────────────────────────────────────
  getLicenseInfo:    ()  => ipcRenderer.invoke('get-license-info'),
  activateLicense:   (p) => ipcRenderer.invoke('activate-license', p),
  deactivateLicense: ()  => ipcRenderer.invoke('deactivate-license'),
  selectLicenseFile: ()  => ipcRenderer.invoke('select-license-file'),

  // ── Window controls ────────────────────────────────────────────────────────
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // ── Misc ───────────────────────────────────────────────────────────────────
  openExternal:       (url) => ipcRenderer.send('open-external-url', { url }),
  reportLayout:       (d)   => ipcRenderer.send('layout-dimensions', d),
  toggleServiceOn:    (id)  => ipcRenderer.send('toggle-service-on', { serviceId: id }),
  suppressBadge:      (a)   => ipcRenderer.send('suppress-badge', a),
  mouseRegion:        (inContentArea) => ipcRenderer.send('mouse-region', { inContentArea }),
  modalOpen:          ()    => ipcRenderer.send('modal-open'),
  modalClose:         ()    => ipcRenderer.send('modal-close'),
  contextMenuOpen:    ()    => ipcRenderer.send('context-menu-open'),
  contextMenuClose:   ()    => ipcRenderer.send('context-menu-close'),
  showOffPage:        (id)  => ipcRenderer.send('show-off-page', { serviceId: id }),
  offPageOpen:        ()    => ipcRenderer.send('off-page-open'),
  offPageClose:       ()    => ipcRenderer.send('off-page-close'),

  // ── Subscriptions (renderer listens to main-process events) ───────────────
  on: (channel, fn) => {
    const allowed = [
      'badge-count', 'memory-update', 'network-update', 'window-resized',
      'service-toggled', 'focus-service', 'open-settings',
      'switch-to-service', 'show-off-page',
    ];
    if (!allowed.includes(channel)) return undefined;
    const handler = (_e, ...args) => fn(...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
