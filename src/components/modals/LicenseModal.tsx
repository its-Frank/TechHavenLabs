'use client';

import { useState, useEffect } from 'react';
import { useElectron } from '@/hooks/useElectron';
import type { LicenseInfo } from '@/types/electron';

export default function LicenseModal() {
  const api = useElectron();
  const [open, setOpen]     = useState(false);
  const [info, setInfo]     = useState<LicenseInfo | null>(null);
  const [msg,  setMsg]      = useState<{ type:'success'|'error'; text:string } | null>(null);

  // Expand titlebarView to full window when open
  useEffect(() => {
    const api = (window as typeof window & { electronAPI?: { modalOpen?: () => void; modalClose?: () => void } }).electronAPI;
    if (open) api?.modalOpen?.(); else api?.modalClose?.();
  }, [open]);

  useEffect(() => {
    if (!api) return;
    api.getLicenseInfo().then(i => {
      setInfo(i);
      // Auto-open if trial expired and no license
      if (!i.hasLicense && !i.inTrial) setOpen(true);
    });
    // Expose global to open from titlebar or hotkey
    (window as typeof window & { __openLicense?: () => void }).__openLicense = () => setOpen(true);
  }, [api]);

  if (!open || !info) return null;

  const selectFile = async () => {
    const result = await api!.selectLicenseFile();
    if (result.success) {
      setMsg({ type:'success', text:'License activated!' });
      const updated = await api!.getLicenseInfo();
      setInfo(updated);
    } else {
      setMsg({ type:'error', text: result.error ?? 'Activation failed' });
    }
  };

  const deactivate = async () => {
    await api!.deactivateLicense();
    const updated = await api!.getLicenseInfo();
    setInfo(updated);
    setMsg(null);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[2000] modal-pop">
      <div className="bg-[#13141f] border border-white/[0.08] rounded-2xl w-[500px] max-w-[92vw] overflow-hidden flex flex-col shadow-xl">

        {/* Drag bar */}
        <div className="drag-region flex items-center justify-between px-4 h-9 bg-[#0e0f1a]">
          <span className="text-[13px] text-white/40">License Activation</span>
          {(info.inTrial || info.hasLicense) && (
            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-rose text-lg transition-colors">✕</button>
          )}
        </div>

        <div className="flex flex-col gap-5 p-8">
          {/* Logo row */}
          <div className="flex items-center gap-3">
            <img src="/assets/icon-256.png" alt="logo" className="w-10 h-10 rounded-xl" />
            <div>
              <h1 className="text-lg font-bold">Unified Comms</h1>
              <p className="text-xs text-white/40">
                {info.hasLicense ? 'License active' : info.inTrial ? `${info.trialDaysLeft} days remaining in trial` : 'Trial expired'}
              </p>
            </div>
          </div>

          {/* Status card */}
          <div className="bg-white/[0.05] border border-white/[0.08] rounded-xl p-4 space-y-2">
            <StatusRow label="Status">
              <span className={info.hasLicense ? 'text-emerald font-semibold' : info.inTrial ? 'text-amber font-semibold' : 'text-rose font-semibold'}>
                {info.hasLicense ? '✓ Active' : info.inTrial ? `Trial — ${info.trialDaysLeft} days left` : '✕ No License'}
              </span>
            </StatusRow>
            {info.expiresAt && <StatusRow label="Expires"><span>{new Date(info.expiresAt).toLocaleDateString()}</span></StatusRow>}
            {info.plan      && <StatusRow label="Plan"><span className="capitalize">{info.plan}</span></StatusRow>}
            {info.email     && <StatusRow label="Email"><span>{info.email}</span></StatusRow>}
          </div>

          {/* Device ID */}
          <div>
            <p className="text-[11px] text-white/30 mb-1">Your Device ID (share with seller to get a license)</p>
            <button
              onClick={() => { navigator.clipboard.writeText(info.deviceId); }}
              className="w-full font-mono text-[11px] text-white/30 bg-black/30 rounded-lg px-3 py-2 text-left break-all hover:bg-black/50 transition-colors"
              title="Click to copy"
            >{info.deviceId}</button>
          </div>

          {/* Drop zone */}
          <div className="border-2 border-dashed border-white/[0.12] rounded-xl p-6 text-center hover:border-emerald hover:bg-emerald/[0.04] transition-colors cursor-pointer"
            onClick={selectFile}>
            <p className="text-[13px] text-white/50">Drop license file here or click to select</p>
            <p className="text-[11px] text-white/25 mt-1">.key or .json</p>
          </div>

          {msg && (
            <p className={`text-center text-[12px] px-3 py-2 rounded-lg ${msg.type==='success' ? 'bg-emerald/10 text-emerald' : 'bg-rose/10 text-rose'}`}>
              {msg.text}
            </p>
          )}

          <button onClick={selectFile}
            className="w-full py-3 bg-gradient-to-br from-[#2d9e6b] to-[#43b581] text-white font-bold rounded-xl hover:opacity-90 transition-opacity">
            Select License File
          </button>

          {info.hasLicense && (
            <button onClick={deactivate}
              className="w-full py-3 bg-white/[0.06] border border-white/[0.1] text-white/50 rounded-xl hover:bg-white/[0.1] transition-colors text-sm">
              Deactivate License
            </button>
          )}
          {(info.inTrial) && (
            <button onClick={() => setOpen(false)}
              className="w-full py-3 bg-white/[0.06] border border-white/[0.1] text-white/50 rounded-xl hover:bg-white/[0.1] transition-colors text-sm">
              Continue with Trial
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[12px] text-white/40">{label}</span>
      <span className="text-[12px]">{children}</span>
    </div>
  );
}
