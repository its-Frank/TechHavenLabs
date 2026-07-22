'use client';

import { useState, useEffect } from 'react';
import { useAppState, useAppDispatch } from '@/store/useAppStore';
import { useElectron } from '@/hooks/useElectron';
import type { AppSettings, Service } from '@/types/electron';

export default function SettingsModal() {
  const state    = useAppState();
  const dispatch = useAppDispatch();
  const api      = useElectron();
  const [open, setOpen]       = useState(false);
  const [local, setLocal]     = useState<AppSettings>({});
  const [saving, setSaving]   = useState(false);
  const [cleanMsg, setCleanMsg] = useState('');
  const [brMsg, setBrMsg]     = useState('');

  // Expand titlebarView to full window when open
  useEffect(() => {
    const api = (window as typeof window & { electronAPI?: { modalOpen?: () => void; modalClose?: () => void } }).electronAPI;
    if (open) api?.modalOpen?.(); else api?.modalClose?.();
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') setOpen(true);
    };
    window.addEventListener('keydown', handler);
    (window as typeof window & { __openSettings?: () => void }).__openSettings = () => setOpen(true);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setLocal({ ...state.settings });
  }, [open, state.settings]);

  const save = async () => {
    setSaving(true);
    await api?.saveSettings(local);
    dispatch({ type: 'SET_SETTINGS', payload: local });
    setSaving(false);
    setOpen(false);
  };

  const removeService = async (svc: Service) => {
    if (!confirm(`Remove "${svc.name}"? This will clear its session data.`)) return;
    const updated = state.services.filter((s: Service) => s.id !== svc.id);
    await api?.saveUserServices(updated);
    dispatch({ type: 'SET_SERVICES', payload: updated });
    await api?.removeServiceData({ accountId: svc.id, partition: `persist:${svc.id}` });
    if (state.currentAccountId === svc.id) dispatch({ type: 'SET_CURRENT', payload: null });
  };

  const clearCaches = async () => {
    if (!confirm('Clear all caches? You will be logged out of all services.')) return;
    for (const svc of state.services) {
      await api?.clearCache(`persist:${svc.id}`).catch(() => {});
    }
    setBrMsg('All caches cleared.');
  };

  const cleanJunk = async () => {
    setCleanMsg('Scanning...');
    const scan = await api?.scanJunkUserdata();
    if (!scan || (scan.files.length + scan.dirs.length === 0)) {
      setCleanMsg('Nothing to clean — already tidy.');
      return;
    }
    const sizeMB = (scan.totalBytes / 1024 / 1024).toFixed(1);
    if (!confirm(`Found ${scan.files.length + scan.dirs.length} item(s) (~${sizeMB} MB). Delete them?`)) {
      setCleanMsg('');
      return;
    }
    const { deleted } = await api!.deleteJunkUserdata({ files: scan.files, dirs: scan.dirs });
    setCleanMsg(`Cleaned ${deleted} item(s), freed ~${sizeMB} MB.`);
  };

  const backupData = async () => {
    setBrMsg('');
    const res = await api?.backupData({});
    if (res?.canceled) return;
    if (res?.success) setBrMsg(`Backup saved to: ${res.backupDir}`);
    else setBrMsg(`Backup failed: ${res?.error || 'unknown error'}`);
  };

  const restoreData = async () => {
    setBrMsg('');
    const scan = await api?.restoreDataScan();
    if (scan?.canceled) return;
    if (!scan?.success) { setBrMsg(`Invalid backup: ${scan?.error}`); return; }
    if (!confirm(`Restore from: ${scan.backupDir}?\n\nApp will restart.`)) return;
    await api?.restoreData({ backupDir: scan.backupDir! });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1000] modal-pop">
      <div className="bg-surface border border-white/[0.06] rounded-2xl w-[520px] max-w-[92vw] max-h-[88vh] overflow-hidden flex flex-col shadow-lg">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl bg-amber/10 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          <h2 className="text-[16px] font-bold flex-1">Settings</h2>
          <button onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/[0.06] text-white/30 hover:bg-rose/10 hover:border-rose/30 hover:text-rose flex items-center justify-center text-base transition-colors">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Performance */}
          <section className="px-6 py-4 border-b border-white/[0.06]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Performance</p>
            <ToggleRow label="Destroy views on switch" desc="Frees memory when switching services"
              checked={!!local.destroyViewsOnSwitch}
              onChange={v => setLocal({ ...local, destroyViewsOnSwitch: v })} />
            <ToggleRow label="Hardware acceleration" desc="Use GPU for rendering"
              checked={local.hardwareAcceleration !== false}
              onChange={v => setLocal({ ...local, hardwareAcceleration: v })} />
            <div className="flex items-center gap-3 py-2">
              <div className="flex-1">
                <p className="text-[13px] font-medium text-white/90">Memory limit (MB)</p>
                <p className="text-[11px] text-white/30 mt-0.5">Max heap usage before cleanup</p>
              </div>
              <input type="number" min={200} max={2000} value={local.memoryLimit || 500}
                onChange={e => setLocal({ ...local, memoryLimit: parseInt(e.target.value) })}
                className="w-20 bg-elevated border border-white/[0.06] rounded-lg px-2 py-1.5 text-[13px] text-white/80 outline-none text-right" />
            </div>
          </section>

          {/* Privacy & Blocking — hidden */}

          {/* Services */}
          <section className="px-6 py-4 border-b border-white/[0.06]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Services</p>
            {state.services.length === 0 ? (
              <p className="text-[12px] text-white/30">No services added yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {state.services.map((svc: Service) => (
                  <div key={svc.id} className="flex items-center gap-2 px-3 py-2 bg-elevated rounded-xl border border-white/[0.04]">
                    {svc.iconDataUrl
                      ? <img src={svc.iconDataUrl} alt={svc.name} className="w-5 h-5 object-contain rounded flex-shrink-0" />
                      : <span className="w-5 h-5 bg-violet rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">{svc.name.charAt(0)}</span>
                    }
                    <span className="flex-1 text-[13px] text-white/70 truncate">{svc.name}</span>
                    <span className="text-[10px] text-white/20 truncate max-w-[120px] hidden sm:block">{svc.url.replace(/^https?:\/\//, '').slice(0, 30)}</span>
                    <button onClick={() => removeService(svc)}
                      className="text-rose/40 hover:text-rose text-sm transition-colors px-1 flex-shrink-0" title="Remove service">✕</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Data */}
          <section className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Data</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={clearCaches}
                className="py-2.5 px-3 bg-elevated border border-white/[0.06] rounded-xl text-xs text-white/50 hover:bg-overlay hover:text-white/80 transition-colors flex items-center justify-center gap-1.5">
                Clear All Caches
              </button>
              <button onClick={cleanJunk}
                className="py-2.5 px-3 bg-elevated border border-white/[0.06] rounded-xl text-xs text-white/50 hover:bg-overlay hover:text-white/80 transition-colors flex items-center justify-center gap-1.5">
                Clean Junk Files
              </button>
              <button onClick={backupData}
                className="py-2.5 px-3 bg-elevated border border-white/[0.06] rounded-xl text-xs text-blue-400/60 hover:bg-overlay hover:text-blue-400 transition-colors flex items-center justify-center gap-1.5">
                Backup Data
              </button>
              <button onClick={restoreData}
                className="py-2.5 px-3 bg-elevated border border-white/[0.06] rounded-xl text-xs text-emerald/60 hover:bg-overlay hover:text-emerald transition-colors flex items-center justify-center gap-1.5">
                Restore Data
              </button>
            </div>
            {cleanMsg && <p className="text-[11px] text-emerald/70 mt-2 px-1">{cleanMsg}</p>}
            {brMsg && <p className="text-[11px] text-white/50 mt-2 px-1 break-all">{brMsg}</p>}
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.06]">
          <button onClick={save} disabled={saving}
            className="w-full py-3 bg-aurora rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60">
            {saving ? 'Saving…' : '✓ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/[0.03] last:border-0">
      <div className="flex-1">
        <p className="text-[13px] font-medium text-white/90">{label}</p>
        <p className="text-[11px] text-white/30 mt-0.5">{desc}</p>
      </div>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative w-10 h-[22px] rounded-full border transition-colors flex-shrink-0 ${checked ? 'bg-violet border-violet' : 'bg-white/10 border-white/[0.06]'}`}>
        <span className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
      </button>
    </div>
  );
}
