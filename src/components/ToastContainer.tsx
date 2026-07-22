'use client';

import { useState, useEffect, useCallback } from 'react';

interface Toast {
  id:          number;
  serviceName: string;
  sender?:     string;
  body:        string;
  iconPath?:   string;
}

let toastId = 0;

/**
 * In-app toast container — shows notifications that arrive via the
 * 'web-notification' IPC channel (forwarded by combined-preload.js).
 * Electron also has a native toast window for when the app is minimised;
 * this one handles the in-app case.
 */
export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Listen for badge-count coming from the electronAPI subscriptions bubbled
  // up through page.tsx, but also expose a global so main can push toasts.
  useEffect(() => {
    (window as typeof window & { __pushToast?: (t: Omit<Toast,'id'>) => void }).__pushToast = (data) => {
      const id = ++toastId;
      setToasts(prev => [...prev.slice(-4), { id, ...data }]);
      setTimeout(() => dismiss(id), 5000);
    };
  }, [dismiss]);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[9000] pointer-events-none max-w-[320px]">
      {toasts.map(t => (
        <div key={t.id}
          className="toast-in pointer-events-auto bg-elevated border border-white/[0.12] rounded-2xl p-3.5 shadow-lg relative overflow-hidden cursor-pointer"
          onClick={() => dismiss(t.id)}
        >
          {/* Aurora accent bar */}
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-aurora rounded-l-2xl" />

          <div className="flex items-center gap-2 mb-2 pl-1">
            {t.iconPath && <img src={t.iconPath} alt="" className="w-5 h-5 rounded object-contain flex-shrink-0" />}
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 flex-1">{t.serviceName}</span>
            <button onClick={e => { e.stopPropagation(); dismiss(t.id); }}
              className="text-white/20 hover:text-white/50 text-sm transition-colors leading-none">✕</button>
          </div>

          {t.sender && (
            <p className="text-[13px] font-semibold text-white mb-1 pl-1">{t.sender}</p>
          )}
          <p className="text-[12px] text-white/60 line-clamp-2 pl-1">{t.body}</p>

          {/* Progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-aurora rounded-b-2xl"
            style={{ animation: 'shrink 5s linear forwards' }} />
        </div>
      ))}

      <style>{`@keyframes shrink { from { width:100%; } to { width:0%; } }`}</style>
    </div>
  );
}
