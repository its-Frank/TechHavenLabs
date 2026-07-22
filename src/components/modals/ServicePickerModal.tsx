'use client';

import { useState, useEffect } from 'react';
import type { Service } from '@/types/electron';
import { useAppState } from '@/store/useAppStore';

const PRESET_SERVICES = [
  { name: 'Gmail',       url: 'https://mail.google.com/mail/u/0/#inbox', icon: 'gmail.svg'    },
  { name: 'Google Chat', url: 'https://chat.google.com/u/0/app/home',    icon: 'gchat.png'    },
  { name: 'Slack',       url: 'https://app.slack.com/client',            icon: 'slack.svg'    },
  { name: 'Teams',       url: 'https://teams.live.com/',                 icon: 'teams.png'    },
  { name: 'Telegram',    url: 'https://web.telegram.org',                icon: 'telegram.svg' },
  { name: 'Discord',     url: 'https://discord.com/app',                 icon: 'discord.svg'  },
  { name: 'WhatsApp',    url: 'https://web.whatsapp.com',                icon: 'whatsapp.svg' },
];

function genId(name: string, existing: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'service';
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function genName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

interface Props { onAdd: (svc: Service) => void; }

export default function ServicePickerModal({ onAdd }: Props) {
  const { services } = useAppState();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (window as typeof window & { __openServicePicker?: () => void }).__openServicePicker = () => setOpen(true);
    const timer = setTimeout(() => {
      if (services.length === 0) setOpen(true);
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expand titlebarView to full window when open
  useEffect(() => {
    const api = (window as typeof window & { electronAPI?: { modalOpen?: () => void; modalClose?: () => void } }).electronAPI;
    if (open) api?.modalOpen?.(); else api?.modalClose?.();
  }, [open]);

  const pick = (preset: typeof PRESET_SERVICES[0]) => {
    const existingIds   = services.map(s => s.id);
    const existingNames = services.map(s => s.name);
    const name = genName(preset.name, existingNames);
    const id   = genId(name, existingIds);
    const svc: Service = {
      id,
      name,
      url: preset.url,
      iconDataUrl: `/assets/icons/${preset.icon}`,
    };
    onAdd(svc);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1000]">
      <div className="modal-pop bg-surface border border-white/[0.06] rounded-2xl w-[420px] max-w-[92vw] overflow-hidden shadow-lg flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl bg-emerald/10 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <h2 className="text-[16px] font-bold flex-1">Add Service</h2>
          {services.length > 0 && (
            <button onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/[0.06] text-white/30 hover:bg-rose/10 hover:border-rose/30 hover:text-rose flex items-center justify-center transition-colors">
              ×
            </button>
          )}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-4 gap-2 p-5">
          {PRESET_SERVICES.map(svc => (
            <button key={svc.name} onClick={() => pick(svc)}
              className="flex flex-col items-center gap-2 py-3 px-2 bg-elevated border-[1.5px] border-white/[0.06] rounded-xl hover:bg-violet/10 hover:border-violet/40 hover:shadow-glow-sm transition-all group">
              <img src={`/assets/icons/${svc.icon}`} alt={svc.name}
                className="w-10 h-10 object-contain rounded-xl group-hover:scale-105 transition-transform" />
              <span className="text-[10px] font-semibold text-white/50 group-hover:text-white/80 text-center leading-tight transition-colors">
                {svc.name}
              </span>
            </button>
          ))}

          {/* Custom URL card */}
          <button
            onClick={() => {
              setOpen(false);
              (window as typeof window & { __openAddService?: () => void }).__openAddService?.();
            }}
            className="flex flex-col items-center gap-2 py-3 px-2 border-[1.5px] border-dashed border-white/[0.12] rounded-xl hover:border-white/25 hover:bg-white/[0.03] transition-all group">
            <div className="w-10 h-10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
            </div>
            <span className="text-[10px] font-semibold text-white/25 group-hover:text-white/40 text-center leading-tight transition-colors">
              Custom URL
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
