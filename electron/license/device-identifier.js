const { execSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');

class DeviceIdentifier {
  _run(cmd) {
    try { return execSync(cmd, { timeout: 3000 }).toString().trim(); } catch(e) { return ''; }
  }

  async getSerialNumber() {
    const p = process.platform;
    if (p === 'win32') {
      const out = this._run('wmic bios get serialnumber /value');
      const m = out.match(/SerialNumber=(.+)/i);
      if (m && m[1].trim() && m[1].trim() !== 'To be filled by O.E.M.') return m[1].trim();
    } else if (p === 'darwin') {
      const out = this._run('ioreg -l | grep IOPlatformSerialNumber');
      const m = out.match(/"IOPlatformSerialNumber"\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    } else {
      try {
        const id = require('fs').readFileSync('/etc/machine-id', 'utf8').trim();
        if (id) return id;
      } catch(e) {}
    }
    return null;
  }

  async getDeviceFingerprint() {
    const serial = await this.getSerialNumber();
    const hostname = os.hostname();
    const cpus = os.cpus().length;
    // First non-internal MAC address
    const nets = os.networkInterfaces();
    let mac = '';
    for (const iface of Object.values(nets)) {
      const found = iface.find(n => !n.internal && n.mac && n.mac !== '00:00:00:00:00:00');
      if (found) { mac = found.mac; break; }
    }
    const raw = [serial || 'no-serial', mac || 'no-mac', hostname, String(cpus)].join('|');
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}

module.exports = DeviceIdentifier;
