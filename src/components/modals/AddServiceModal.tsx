'use client';

import { useState, useEffect, useRef } from 'react';
import type { Service } from '@/types/electron';
import { useAppState } from '@/store/useAppStore';

function genId(name: string, existing: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'service';
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

interface Props { onAdd: (svc: Service) => void; }

export default function AddServiceModal({ onAdd }: Props) {
  const { services } = useAppState();
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState('');
  const [url,  setUrl]        = useState('');
  const [icon, setIcon]       = useState('');
  const [fetching, setFetching] = useState(false);
  const [error, setError]     = useState('');
  const fileRef               = useRef<HTMLInputElement>(null);

  // Expand titlebarView to full window when open
  useEffect(() => {
    const api = (window as typeof window & { electronAPI?: { modalOpen?: () => void; modalClose?: () => void } }).electronAPI;
    if (open) api?.modalOpen?.(); else api?.modalClose?.();
  }, [open]);

  useEffect(() => {
    (window as typeof window & { __openAddService?: () => void }).__openAddService = () => {
      setName(''); setUrl(''); setIcon(''); setError('');
      setOpen(true);
    };
  }, []);

  const fetchIcon = async () => {
    if (!url) return;
    setFetching(true);
    try {
      // Use Electron's native fetch-favicon IPC if available, else Google favicon service
      const api = (window as typeof window & { electronAPI?: { fetchFavicon?: (a: {url:string}) => Promise<{dataUrl:string|null}> } }).electronAPI;
      if (api?.fetchFavicon) {
        const res = await api.fetchFavicon({ url });
        if (res?.dataUrl) { setIcon(res.dataUrl); return; }
      }
      const origin = new URL(url).origin;
      setIcon(`https://www.google.com/s2/favicons?sz=64&domain=${origin}`);
    } catch {
      setError('Invalid URL');
    } finally {
      setFetching(false);
    }
  };

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Try Electron native picker first
    const api = (window as typeof window & { electronAPI?: { pickIconFile?: () => Promise<{dataUrl:string|null}> } }).electronAPI;
    if (api?.pickIconFile) {
      const res = await api.pickIconFile();
      if (res?.dataUrl) { setIcon(res.dataUrl); return; }
    }
    // Fallback to browser file input
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setIcon(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!url.trim())  { setError('URL is required');  return; }
    try { new URL(url); } catch { setError('Enter a valid URL (https://...)'); return; }
    const id = genId(name.trim(), services.map(s => s.id));
    onAdd({ id, name: name.trim(), url: url.trim(), iconDataUrl: icon || undefined });
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1001]">
      <div className="modal-pop bg-surface border border-white/[0.06] rounded-2xl w-[440px] max-w-[92vw] overflow-hidden shadow-lg flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl bg-emerald/10 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <h2 className="text-[16px] font-bold flex-1">Custom Service</h2>
          <button onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/[0.06] text-white/30 hover:bg-rose/10 hover:border-rose/30 hover:text-rose flex items-center justify-center transition-colors">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 p-6">

          {/* Name */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/30">Name</span>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Gmail Work"
              className="bg-elevated border border-white/[0.06] focus:border-violet focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)] rounded-xl px-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-white/20"
            />
          </label>

          {/* URL */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/30">URL</span>
            <input
              type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://mail.google.com"
              className="bg-elevated border border-white/[0.06] focus:border-violet focus:shadow-[0_0_0_3px_rgba(139,92,246,0.15)] rounded-xl px-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-white/20"
            />
          </label>

          {/* Icon */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/30">Icon</span>
            <div className="flex items-center gap-2">
              {/* Preview */}
              <div className="w-11 h-11 rounded-xl bg-elevated border border-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden">
                {icon
                  ? <img src={icon} alt="" className="w-9 h-9 object-contain" />
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
                }
              </div>
              <button onClick={fetchIcon} disabled={fetching || !url}
                className="flex-1 py-2 px-3 bg-elevated border border-white/[0.06] rounded-xl text-[12px] text-white/50 hover:bg-overlay hover:text-white/80 disabled:opacity-40 transition-colors">
                {fetching ? 'Fetching…' : 'Fetch from URL'}
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="py-2 px-3 bg-elevated border border-white/[0.06] rounded-xl text-[12px] text-white/50 hover:bg-overlay hover:text-white/80 transition-colors">
                Choose file
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-rose bg-rose/10 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button onClick={submit}
            className="w-full py-3 bg-aurora rounded-xl text-white text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Add Service
          </button>
        </div>
      </div>
    </div>
  );
}
