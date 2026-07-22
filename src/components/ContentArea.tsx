'use client';

import { useAppState } from '@/store/useAppStore';
import ServiceOffPage from '@/components/ServiceOffPage';
import type { Service } from '@/types/electron';

interface Props {
  onTurnOn?: (id: string) => void;
}

export default function ContentArea({ onTurnOn }: Props) {
  const { currentAccountId, offPageServiceId, services } = useAppState();

  // Show "service off" page when a disabled service is clicked
  if (offPageServiceId) {
    const svc = services.find((s: Service) => s.id === offPageServiceId);
    if (svc && onTurnOn) {
      return <ServiceOffPage service={svc} onTurnOn={onTurnOn} />;
    }
  }

  if (!currentAccountId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-base gap-4">
        <div className="w-16 h-16 rounded-2xl bg-violet/10 border border-violet/20 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
        </div>
        <div className="text-center">
          <p className="text-white/60 text-sm font-medium">No service selected</p>
          <p className="text-white/30 text-xs mt-1">Add a service from the sidebar to get started</p>
        </div>
      </div>
    );
  }

  // Service is active — Electron's WebContentsView renders behind this transparent area
  return (
    <div
      className="flex-1 relative"
      style={{ pointerEvents: 'none' }}
      aria-label="Service content area"
    />
  );
}
