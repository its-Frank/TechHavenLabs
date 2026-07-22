'use client';

import { useEffect } from 'react';
import { useAppState, useAppDispatch } from '@/store/useAppStore';
import { useElectron } from '@/hooks/useElectron';
import Image from 'next/image';

export default function Titlebar() {
  const state    = useAppState();
  const dispatch = useAppDispatch();
  const api      = useElectron();

  // Report layout dimensions to main so service views resize correctly
  useEffect(() => {
    api?.reportLayout({ titlebarHeight: 68, sidebarWidth: 64 });
    // Re-report on window resize
    const cleanup = api?.on('window-resized', () => {
      api?.reportLayout({ titlebarHeight: 68, sidebarWidth: 64 });
    });
    return () => cleanup?.();
  }, [api]);

  // blocking features removed
  const reloadCurrent  = () => { if (state.currentAccountId) api?.reloadView({ accountId: state.currentAccountId }); };

  // Mark all services as read — reset all badge counts and suppress
  const markAllRead = () => {
    Object.entries(state.badgeCounts).forEach(([accountId, count]) => {
      if ((count as number) > 0) {
        api?.suppressBadge({ accountId, count: count as number });
        dispatch({ type: 'SET_BADGE', payload: { accountId, count: 0 } });
      }
    });
  };

  const hasUnread = Object.values(state.badgeCounts).some((c: unknown) => (c as number) > 0);

  return (
    <div className="drag-region flex items-center h-[68px] min-h-[68px] bg-void border-b border-white/[0.06] flex-shrink-0 w-full z-[300] relative">

      {/* Logo */}
      <div className="flex items-center justify-center w-[64px] h-[68px] flex-shrink-0 pointer-events-none drag-region">
        <Image src="/assets/icon-256.png" alt="logo" width={40} height={40} priority
          className="rounded-xl" style={{ filter: 'drop-shadow(0 0 8px rgba(139,92,246,0.5))' }} />
      </div>

      {/* Title */}
      <span className="text-aurora text-[18px] font-black uppercase tracking-[3px] flex-1 text-center pointer-events-none truncate drag-region">
        Unified Comms
      </span>

      {/* Action buttons */}
      <div className="no-drag-region flex items-center gap-0.5 px-2 flex-shrink-0">

        {/* Mark all read — only shown when there are unread badges */}
        {hasUnread && (
          <button onClick={markAllRead} title="Mark all as read"
            className="flex items-center justify-center w-9 h-9 rounded-md text-emerald hover:bg-emerald/10 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
        )}

        {/* Reload */}
        <button onClick={reloadCurrent} title="Reload current service"
          className="flex items-center justify-center w-9 h-9 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>
          </svg>
        </button>

        {/* Add Service */}
        <button
          onClick={() => (window as typeof window & { __openServicePicker?: () => void }).__openServicePicker?.()}
          title="Add Service"
          className="flex items-center justify-center w-9 h-9 rounded-md text-emerald hover:bg-emerald/10 transition-colors no-drag-region">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </button>

        {/* Settings */}
        <button
          onClick={() => (window as typeof window & { __openSettings?: () => void }).__openSettings?.()}
          title="Settings"
          className="flex items-center justify-center w-9 h-9 rounded-md text-amber hover:bg-amber/10 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>

        {/* Help */}
        <button
          onClick={() => (window as typeof window & { __openHelp?: () => void }).__openHelp?.()}
          title="Help"
          className="flex items-center justify-center w-9 h-9 rounded-md text-blue-400 hover:bg-blue-400/10 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </button>
      </div>

      {/* Network + RAM card */}
      <div className="no-drag-region flex-shrink-0 mx-2">
        <div className="flex items-stretch bg-white/[0.04] border border-white/[0.06] rounded-xl overflow-hidden h-10">
          <div className="flex flex-col items-center justify-center px-3 min-w-[80px]">
            <span className={`text-[13px] font-black tabular-nums leading-none
              ${state.networkOnline ? (state.networkMbps > 0 ? 'text-emerald' : 'text-white/40') : 'text-rose'}`}>
              {state.networkOnline
                ? (state.networkMbps > 0 ? `${state.networkMbps.toFixed(1)}` : '—')
                : 'Off'}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/20 mt-0.5">
              {state.networkOnline ? (state.networkMbps > 0 ? 'Mbps' : 'online') : 'offline'}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-3 min-w-[72px] border-l border-white/[0.06]">
            <span className="text-[13px] font-black tabular-nums leading-none text-white/40">{state.memoryMb}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-white/20 mt-0.5">MB RAM</span>
          </div>
        </div>
      </div>

      {/* Window controls */}
      <div className="no-drag-region flex flex-shrink-0">
        {([
          { id: 'min', action: () => api?.minimize(), hover: 'hover:bg-white/[0.06]',
            icon: <rect x="0" y="5" width="12" height="2" fill="currentColor"/> },
          { id: 'max', action: () => api?.maximize(), hover: 'hover:bg-white/[0.06]',
            icon: <rect x="1" y="1" width="10" height="10" stroke="currentColor" strokeWidth="1.5" fill="none"/> },
          { id: 'cls', action: () => api?.close(), hover: 'hover:bg-red-600 hover:text-white',
            icon: <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" strokeWidth="1.5"/> },
        ] as const).map(b => (
          <button key={b.id} onClick={b.action}
            className={`flex items-center justify-center w-[46px] h-[68px] text-white/30 transition-colors ${b.hover}`}>
            <svg width="12" height="12" viewBox="0 0 12 12">{b.icon}</svg>
          </button>
        ))}
      </div>
    </div>
  );
}
