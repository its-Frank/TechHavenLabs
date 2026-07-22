const Store = require('electron-store');
const { dialog, BrowserWindow, ipcMain, app } = require('electron');
const DeviceIdentifier = require('./device-identifier');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SECRET_KEY = 'uc-license-secret-2024-unified-comms';
const TRIAL_DAYS = 30;

class LicenseManager {
  constructor() {
    this.store = new Store({ name: 'license', encryptionKey: SECRET_KEY });
    this.deviceId = null;
    this._win = null;
  }

  async initialize() {
    const identifier = new DeviceIdentifier();
    this.deviceId = await identifier.getDeviceFingerprint();
    // Seed trial start date on first run
    if (!this.store.get('trialStart')) {
      this.store.set('trialStart', new Date().toISOString());
    }
    return this.deviceId;
  }

  // ── Trial ──────────────────────────────────────────────────────────────────
  _trialDaysLeft() {
    const start = this.store.get('trialStart');
    if (!start) return 0;
    const elapsed = (Date.now() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(TRIAL_DAYS - elapsed));
  }

  // ── License verification ───────────────────────────────────────────────────
  _sign(data) {
    return crypto.createHmac('sha256', SECRET_KEY).update(JSON.stringify(data)).digest('hex');
  }

  verifyLicense(lic) {
    if (!lic || !lic.licenseKey || !lic.deviceId || !lic.expiresAt || !lic.signature) {
      return { valid: false, reason: 'Invalid license format' };
    }
    // Verify signature
    const { signature, ...payload } = lic;
    if (this._sign(payload) !== signature) {
      return { valid: false, reason: 'License signature invalid' };
    }
    // Device binding
    if (lic.deviceId !== this.deviceId) {
      return { valid: false, reason: 'License is bound to a different device' };
    }
    // Expiry
    const expiresAt = new Date(lic.expiresAt);
    if (isNaN(expiresAt.getTime())) return { valid: false, reason: 'Invalid expiry date' };
    const now = new Date();
    if (now > expiresAt) {
      return { valid: false, reason: 'License has expired', expired: true };
    }
    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    return { valid: true, daysLeft, plan: lic.plan || 'standard', expiresAt: lic.expiresAt, email: lic.email };
  }

  isValid() {
    const lic = this.store.get('license', null);
    if (!lic) return false;
    return this.verifyLicense(lic).valid;
  }

  getLicenseInfo() {
    const lic = this.store.get('license', null);
    const trialDaysLeft = this._trialDaysLeft();
    const inTrial = trialDaysLeft > 0;

    if (!lic) {
      return { hasLicense: false, inTrial, trialDaysLeft, deviceId: this.deviceId };
    }
    const result = this.verifyLicense(lic);
    return {
      hasLicense: result.valid,
      inTrial: false,
      trialDaysLeft: 0,
      valid: result.valid,
      reason: result.reason,
      daysLeft: result.daysLeft,
      plan: result.plan,
      expiresAt: result.expiresAt,
      email: result.email,
      deviceId: this.deviceId,
    };
  }

  async activateFromFile(filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const lic = JSON.parse(raw);
      const result = this.verifyLicense(lic);
      if (!result.valid) return { success: false, error: result.reason };
      this.store.set('license', lic);
      return { success: true, ...result };
    } catch(e) {
      return { success: false, error: 'Could not read license file: ' + e.message };
    }
  }

  deactivate() {
    this.store.delete('license');
    return { success: true };
  }

  // ── Activation window ──────────────────────────────────────────────────────
  async showLicenseDialog(parentWin) {
    if (this._win && !this._win.isDestroyed()) { this._win.focus(); return; }
    this._win = new BrowserWindow({
      width: 520, height: 600,
      parent: parentWin || null,
      modal: !!parentWin,
      resizable: false,
      frame: false,
      show: false,
      backgroundColor: '#13141f',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
      icon: path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    });
    this._win.loadFile(path.join(__dirname, 'license-activation.html'));
    this._win.once('ready-to-show', () => this._win.show());
    this._win.on('closed', () => { this._win = null; });
  }
}

module.exports = LicenseManager;
