'use client';

import type { Service } from '@/types/electron';

interface Props {
  service: Service;
  onTurnOn: (id: string) => void;
}

export default function ServiceOffPage({ service, onTurnOn }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-base select-none gap-6 px-8">

      {/* Service icon */}
      <div className="w-[80px] h-[80px] rounded-[22px] bg-white/[0.06] border border-white/[0.08] flex items-center justify-center overflow-hidden shadow-lg">
        {service.iconDataUrl
          ? <img src={service.iconDataUrl} alt={service.name} className="w-[52px] h-[52px] object-contain opacity-60" />
          : <span className="text-3xl font-black text-white/30">{service.name.charAt(0).toUpperCase()}</span>
        }
      </div>

      {/* Name */}
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-[22px] font-bold text-white/80">{service.name}</h2>
        <span className="px-3 py-1 rounded-full border border-white/[0.12] text-[11px] font-bold uppercase tracking-widest text-white/30">
          Service is Turned Off
        </span>
      </div>

      {/* Description */}
      <div className="flex flex-col items-center gap-3 max-w-[400px] text-center">
        <p className="text-[13px] text-white/40 leading-relaxed">
          This service is not running and uses no memory. To turn it back on:
        </p>
        <ul className="flex flex-col gap-1.5 text-[12px] text-white/25">
          <li className="flex items-center gap-2">
            <span className="text-white/15">·</span>
            Hover the sidebar icon → click the power button
          </li>
          <li className="flex items-center gap-2">
            <span className="text-white/15">·</span>
            Right-click the sidebar icon → Turn On
          </li>
          <li className="flex items-center gap-2">
            <span className="text-white/15">·</span>
            Settings → Services
          </li>
        </ul>
      </div>

      {/* Turn On button */}
      <button
        onClick={() => onTurnOn(service.id)}
        className="px-8 py-3 rounded-xl font-bold text-[14px] text-white transition-opacity hover:opacity-90 active:scale-95"
        style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
      >
        Turn On {service.name}
      </button>

    </div>
  );
}
