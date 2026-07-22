'use client';

import { useReducer, useEffect, useCallback, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppStateCtx, AppDispatchCtx, reducer, DEFAULT_STATE } from '@/store/useAppStore';
import { useElectron } from '@/hooks/useElectron';
import Titlebar           from '@/components/Titlebar';
import Sidebar            from '@/components/Sidebar';
import ContentArea        from '@/components/ContentArea';
import SettingsModal      from '@/components/modals/SettingsModal';
import ServicePickerModal from '@/components/modals/ServicePickerModal';
import AddServiceModal    from '@/components/modals/AddServiceModal';
import HelpModal          from '@/components/modals/HelpModal';
import LicenseModal       from '@/components/modals/LicenseModal';
import ToastContainer     from '@/components/ToastContainer';
import type { Service }   from '@/types/electron';

function AppInner() {
  const searchParams = useSearchParams();
  // Read view type — useSearchParams is reliable client-side with Suspense
  // Also fallback to window.location.search for safety
  const viewParam = searchParams.get('view') ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('view')
      : null);
  const IS_SIDEBAR  = viewParam === 'sidebar';
  const IS_TITLEBAR = !IS_SIDEBAR;

  // Debug log — remove after fix confirmed
  useEffect(() => {
    console.log(`[AppInner] viewParam=${viewParam} IS_SIDEBAR=${IS_SIDEBAR} url=${window.location.href}`);
  }, []);

  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const api = useElectron();
  const switchServiceRef = useRef<((id: string) => void) | null>(null);

  // ── Bootstrap: load persisted data ────────────────────────────────────────
  useEffect(() => {
    if (!api) return;
    (async () => {
      const [settings, services, sidebarOrder] = await Promise.all([
        api.getSettings(),
        api.getUserServices(),
        api.getSidebarOrder(),
      ]);
      dispatch({ type: 'SET_SETTINGS',      payload: settings });
      dispatch({ type: 'SET_SERVICES',      payload: services });
      dispatch({ type: 'SET_SIDEBAR_ORDER', payload: sidebarOrder });

      // Only create/switch views in titlebar view
      if (IS_TITLEBAR && services.length > 0) {
        const first = services[0];
        await api.createView({ accountId: first.id, url: first.url, partition: `persist:${first.id}` });
        await api.switchView({ accountId: first.id });
        dispatch({ type: 'SET_CURRENT', payload: first.id });
        // Background-preload other services after 2s so badges flow in immediately
        setTimeout(() => {
          const disabled = new Set<string>(settings.disabledServices || []);
          services.slice(1).forEach(svc => {
            if (!disabled.has(svc.id)) {
              api.createView({ accountId: svc.id, url: svc.url, partition: `persist:${svc.id}` }).catch(()=>{});
            }
          });
        }, 2000);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Subscribe to main-process IPC events ───────────────────────────────────
  useEffect(() => {
    if (!api) return;
    const cleanups: Array<(() => void) | undefined> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cleanups.push(api.on('badge-count',     (d: any) => dispatch({ type: 'SET_BADGE',    payload: d })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cleanups.push(api.on('memory-update',   (d: any) => dispatch({ type: 'SET_MEMORY',   payload: d.mb })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cleanups.push(api.on('network-update',  (d: any) => dispatch({ type: 'SET_NETWORK',  payload: d })));
    // Focus a service when toast is clicked
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cleanups.push(api.on('focus-service',   (d: any) => { if (d?.accountId) switchServiceRef.current?.(d.accountId); }));
    // Ctrl+, keyboard shortcut from main
    cleanups.push(api.on('open-settings',   () => { (window as typeof window & { __openSettings?: () => void }).__openSettings?.(); }));
    // Ctrl+1-9 keyboard shortcut from main
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cleanups.push(api.on('switch-to-service', (d: any) => { if (d?.accountId) switchServiceRef.current?.(d.accountId); }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cleanups.push(api.on('show-off-page',     (d: any) => {
      if (IS_TITLEBAR) {
        dispatch({ type: 'SET_OFF_PAGE', payload: d?.serviceId ?? null });
        if (d?.serviceId) dispatch({ type: 'SET_CURRENT', payload: d.serviceId });
      }
    }));
    return () => cleanups.forEach(fn => fn?.());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // ── Switch to a service (creates view if needed) ───────────────────────────
  const switchService = useCallback(async (accountId: string) => {
    if (!api) return;
    const svc = state.services.find((s: Service) => s.id === accountId);
    if (!svc) return;

    // If service is disabled, show the off-page instead of loading it
    if (state.disabledServices.has(accountId)) {
      dispatch({ type: 'SET_OFF_PAGE', payload: accountId });
      dispatch({ type: 'SET_CURRENT', payload: accountId });
      // Also tell the other view (titlebarView) via IPC broadcast
      const _eapi = (window as typeof window & { electronAPI?: { showOffPage?: (id: string) => void } }).electronAPI;
      _eapi?.showOffPage?.(accountId);
      return;
    }

    // Clear off-page on both views when switching to active service
    dispatch({ type: 'SET_OFF_PAGE', payload: null });
    const _eapi2 = (window as typeof window & { electronAPI?: { showOffPage?: (id: string | null) => void } }).electronAPI;
    _eapi2?.showOffPage?.(null);
    await api.createView({ accountId, url: svc.url, partition: `persist:${accountId}` });
    await api.switchView({ accountId });
    dispatch({ type: 'SET_CURRENT', payload: accountId });
  }, [api, state.services, state.disabledServices]);

  // ── Turn on a disabled service from the off-page ──────────────────────────
  const turnOnService = useCallback(async (accountId: string) => {
    if (!api) return;
    // Update settings to remove from disabled list
    const s = { ...state.settings };
    const d = new Set<string>(s.disabledServices || []);
    d.delete(accountId);
    s.disabledServices = [...d];
    await api.saveSettings(s);
    dispatch({ type: 'SET_SETTINGS', payload: s });
    dispatch({ type: 'SET_OFF_PAGE', payload: null });
    // Now switch to the service (it's no longer disabled)
    const svc = state.services.find((sv: Service) => sv.id === accountId);
    if (!svc) return;
    await api.createView({ accountId, url: svc.url, partition: `persist:${accountId}` });
    await api.switchView({ accountId });
    dispatch({ type: 'SET_CURRENT', payload: accountId });
  }, [api, state.settings, state.services]);

  // ── Expand/shrink titlebarView to content area when off-page shows/hides ──
  useEffect(() => {
    if (!IS_TITLEBAR) return;
    const _api = (window as typeof window & { electronAPI?: { offPageOpen?: () => void; offPageClose?: () => void } }).electronAPI;
    if (state.offPageServiceId) _api?.offPageOpen?.();
    else _api?.offPageClose?.();
  }, [state.offPageServiceId, IS_TITLEBAR]);

  // Keep ref up-to-date for IPC callbacks
  useEffect(() => { switchServiceRef.current = switchService; }, [switchService]);

  const addService = useCallback(async (svc: Service) => {
    const updated: Service[] = [...state.services, svc];
    await api?.saveUserServices(updated);
    dispatch({ type: 'SET_SERVICES', payload: updated });
    await switchService(svc.id);
  }, [api, state.services, switchService]);

  // ── Listen for add-service events dispatched by the Sidebar picker ─────────
  useEffect(() => {
    const handler = (e: Event) => addService((e as CustomEvent<Service>).detail);
    window.addEventListener('add-service', handler);
    return () => window.removeEventListener('add-service', handler);
  }, [addService]);

  return (
    <AppStateCtx.Provider value={state}>
      <AppDispatchCtx.Provider value={dispatch}>

        {IS_TITLEBAR && (
          <>
            {/* Titlebar strip — full width, top */}
            <div className="fixed inset-0 flex flex-col select-none overflow-hidden" style={{ background: 'transparent' }}>
              <Titlebar />
              {/* Service off-page — shown in content area when service is disabled */}
              {state.offPageServiceId && (
                <div className="flex flex-1 overflow-hidden">
                  <div style={{ width: 64, flexShrink: 0 }} />
                  <ContentArea onTurnOn={turnOnService} />
                </div>
              )}
            </div>
            {/* Modals rendered in titlebar view */}
            <SettingsModal />
            <ServicePickerModal onAdd={addService} />
            <AddServiceModal    onAdd={addService} />
            <HelpModal />
            <LicenseModal />
            <ToastContainer />
          </>
        )}

        {IS_SIDEBAR && (
          /* Sidebar strip — narrow, full height */
          <div className="fixed inset-0 select-none overflow-visible" style={{ background: 'transparent' }}>
            <Sidebar onSwitch={switchService} />
          </div>
        )}

      </AppDispatchCtx.Provider>
    </AppStateCtx.Provider>
  );
}

// Wrap in Suspense — required by Next.js App Router for useSearchParams()
export default function App() {
  return (
    <Suspense>
      <AppInner />
    </Suspense>
  );
}
