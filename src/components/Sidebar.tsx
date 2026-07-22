'use client';

import { useCallback, useState, useRef } from 'react';
import { useAppState, useAppDispatch } from '@/store/useAppStore';
import { useElectron } from '@/hooks/useElectron';
import type { Service, SidebarItem } from '@/types/electron';

interface Props { onSwitch: (accountId: string) => void; }

interface CtxMenu { type: 'service'|'group'; id: string; x: number; y: number; groupId?: string; }

export default function Sidebar({ onSwitch }: Props) {
  const state    = useAppState();
  const dispatch = useAppDispatch();
  const api      = useElectron();

  const [ctx,             setCtx]             = useState<CtxMenu | null>(null);
  const [renaming,        setRenaming]        = useState<string | null>(null);
  const [renameVal,       setRenameVal]       = useState('');
  const [expandedGroups,  setExpandedGroups]  = useState<Set<string>>(new Set());

  const dragIdx  = useRef<number | null>(null);
  const dropZone = useRef<'top' | 'bottom' | 'center'>('bottom');

  const isDisabled = (id: string) => state.disabledServices.has(id);
  const badge      = (id: string) => state.badgeCounts[id] ?? 0;

  // ── Build sidebar order ────────────────────────────────────────────────────
  const getOrder = useCallback((): SidebarItem[] => {
    const raw    = state.sidebarOrder;
    const allIds = new Set(state.services.map((s: Service) => s.id));
    if (!raw) return state.services.map((s: Service) => ({ type: 'service' as const, id: s.id }));
    const result: SidebarItem[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (item.type === 'service') {
        if (allIds.has(item.id) && !seen.has(item.id)) { result.push({ type: 'service', id: item.id }); seen.add(item.id); }
      } else if (item.type === 'group') {
        const valid = (item.serviceIds || []).filter((id: string) => allIds.has(id) && !seen.has(id));
        valid.forEach((id: string) => seen.add(id));
        if (valid.length >= 1) result.push({ type: 'group', id: item.id, name: item.name, serviceIds: valid });
      }
    }
    state.services.forEach((s: Service) => { if (!seen.has(s.id)) result.push({ type: 'service', id: s.id }); });
    return result;
  }, [state.sidebarOrder, state.services]);

  const saveOrder = useCallback(async (order: SidebarItem[]) => {
    dispatch({ type: 'SET_SIDEBAR_ORDER', payload: order });
    await api?.saveSidebarOrder(order);
  }, [api, dispatch]);

  // ── Service actions ────────────────────────────────────────────────────────
  const handleSwitch = useCallback((svc: Service) => {
    onSwitch(svc.id);  // always call — switchService handles disabled state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSwitch]);

  const toggleService = useCallback(async (id: string) => {
    const s = { ...state.settings };
    const d = new Set<string>(s.disabledServices || []);
    d.has(id) ? d.delete(id) : d.add(id);
    s.disabledServices = [...d];
    await api?.saveSettings(s);
    dispatch({ type: 'SET_SETTINGS', payload: s });
    setCtx(null);
  }, [api, dispatch, state.settings]);

  const removeService = useCallback(async (id: string) => {
    const updated = state.services.filter((s: Service) => s.id !== id);
    await api?.saveUserServices(updated);
    dispatch({ type: 'SET_SERVICES', payload: updated });
    await api?.destroyView({ accountId: id });
    if (state.currentAccountId === id) dispatch({ type: 'SET_CURRENT', payload: null });
    setCtx(null);
  }, [api, dispatch, state.services, state.currentAccountId]);

  const renameService = useCallback(async (id: string, newName: string) => {
    if (!newName.trim()) return;
    const updated = state.services.map((s: Service) => s.id === id ? { ...s, name: newName.trim() } : s);
    await api?.saveUserServices(updated);
    dispatch({ type: 'SET_SERVICES', payload: updated });
    setRenaming(null);
  }, [api, dispatch, state.services]);

  const removeFromGroup = useCallback(async (svcId: string, groupId: string) => {
    const order = getOrder().map((item: SidebarItem): SidebarItem | null => {
      if (item.id !== groupId) return item;
      const ids = (item.serviceIds || []).filter((id: string) => id !== svcId);
      if (ids.length === 0) return null;
      if (ids.length === 1) return { type: 'service', id: ids[0] };
      return { ...item, serviceIds: ids };
    }).filter((x: SidebarItem | null): x is SidebarItem => x !== null);
    const gIdx = order.findIndex((i: SidebarItem) => i.id === groupId);
    order.splice(gIdx + 1, 0, { type: 'service', id: svcId });
    await saveOrder(order);
    setCtx(null);
  }, [getOrder, saveOrder]);

  const ungroupAll = useCallback(async (groupId: string) => {
    const group = getOrder().find((i: SidebarItem) => i.id === groupId);
    if (!group || group.type !== 'group') return;
    const idx = getOrder().findIndex((i: SidebarItem) => i.id === groupId);
    const order = [...getOrder()];
    order.splice(idx, 1, ...(group.serviceIds || []).map((id: string) => ({ type: 'service' as const, id })));
    await saveOrder(order);
    setCtx(null);
  }, [getOrder, saveOrder]);

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, index: number) => {
    dragIdx.current = index;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => (e.target as HTMLElement).classList.add('opacity-40'), 0);
  };
  const onDragEnd = (e: React.DragEvent) => (e.target as HTMLElement).classList.remove('opacity-40');

  const onDragOver = (e: React.DragEvent, index: number, el: Element) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === index) return;
    (el as HTMLElement).classList.remove('drop-top', 'drop-bottom', 'drop-group');
    const rect = el.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const zone: 'top' | 'bottom' | 'center' = relY < rect.height * 0.25 ? 'top' : relY > rect.height * 0.75 ? 'bottom' : 'center';
    dropZone.current = zone;
    (el as HTMLElement).classList.add(zone === 'center' ? 'drop-group' : zone === 'top' ? 'drop-top' : 'drop-bottom');
  };
  const onDragLeave = (el: Element) => (el as HTMLElement).classList.remove('drop-top', 'drop-bottom', 'drop-group');

  const onDrop = (e: React.DragEvent, index: number, el: Element) => {
    e.preventDefault();
    (el as HTMLElement).classList.remove('drop-top', 'drop-bottom', 'drop-group');
    if (dragIdx.current === null || dragIdx.current === index) return;
    const srcIdx = dragIdx.current;
    dragIdx.current = null;
    const order = [...getOrder()];
    const [moved] = order.splice(srcIdx, 1);
    const zone = dropZone.current;

    if (zone === 'center') {
      const target = order[srcIdx < index ? index - 1 : index];
      const groupId = 'group-' + Date.now();
      const movedIds  = moved.type === 'group' ? (moved.serviceIds || []) : [moved.id];
      const targetIds = target?.type === 'group' ? (target.serviceIds || []) : [target?.id || ''];
      const targetIdx = order.indexOf(target);
      if (targetIdx >= 0) order.splice(targetIdx, 1, { type: 'group', id: groupId, name: 'Group', serviceIds: [...movedIds, ...targetIds] });
    } else {
      const insertAt = srcIdx < index
        ? (zone === 'bottom' ? index : index - 1)
        : (zone === 'top'    ? index : index + 1);
      order.splice(Math.max(0, insertAt), 0, moved);
    }
    saveOrder(order);
  };

  // ── Right-click ────────────────────────────────────────────────────────────
  const openCtx = (e: React.MouseEvent, type: 'service' | 'group', id: string, groupId?: string) => {
    e.preventDefault(); e.stopPropagation();
    setCtx({ type, id, x: e.clientX, y: e.clientY, groupId });
    // Expand sidebarView so menu renders over service view
    const api = (window as typeof window & { electronAPI?: { contextMenuOpen?: () => void } }).electronAPI;
    api?.contextMenuOpen?.();
  };

  // ── Add service picker — now in Titlebar ──────────────────────────────────

  const order = getOrder();

  return (
    <aside className="relative flex flex-col items-center w-[64px] min-w-[64px] bg-void border-r border-white/[0.06] py-2.5 z-[200] no-drag-region overflow-visible h-full"
      style={{ height: '100vh' }}>
      {/* Service list */}
      <div className="flex flex-col gap-0.5 px-1.5 overflow-y-auto overflow-x-visible w-full flex-1" style={{ scrollbarWidth: 'none' }}>
        {order.map((item: SidebarItem, index: number) =>
          item.type === 'service' ? (
            <SvcBtn key={item.id} id={item.id} index={index} services={state.services}
              active={state.currentAccountId === item.id} disabled={isDisabled(item.id)} badge={badge(item.id)}
              onSwitch={handleSwitch} onPower={toggleService}
              onCtx={(e) => openCtx(e, 'service', item.id)}
              onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            />
          ) : (
            <GrpBtn key={item.id} group={item} index={index} services={state.services}
              badges={state.badgeCounts} currentId={state.currentAccountId}
              expanded={expandedGroups.has(item.id)}
              onToggle={() => setExpandedGroups((prev: Set<string>) => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}
              onSwitch={handleSwitch}
              onCtx={(e) => openCtx(e, 'group', item.id)}
              onItemCtx={(e, sid) => openCtx(e, 'service', sid, item.id)}
              onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            />
          )
        )}
      </div>

      {/* Preset picker popover — moved to Titlebar */}

      {/* Context menu */}
      {ctx && (
        <CtxMenu ctx={ctx} services={state.services} order={order} isDisabled={isDisabled}
          onClose={() => {
            setCtx(null);
            const api = (window as typeof window & { electronAPI?: { contextMenuClose?: () => void } }).electronAPI;
            api?.contextMenuClose?.();
          }}
          onPower={() => { toggleService(ctx.id); const _a = (window as typeof window & { electronAPI?: { contextMenuClose?: () => void } }).electronAPI; _a?.contextMenuClose?.(); }}
          onRemove={() => { removeService(ctx.id); const _a = (window as typeof window & { electronAPI?: { contextMenuClose?: () => void } }).electronAPI; _a?.contextMenuClose?.(); }}
          onRename={() => { setRenameVal(state.services.find((s: Service) => s.id === ctx.id)?.name || ''); setRenaming(ctx.id); setCtx(null); const _a = (window as typeof window & { electronAPI?: { contextMenuClose?: () => void } }).electronAPI; _a?.contextMenuClose?.(); }}
          onRemoveFromGroup={() => { if (ctx.groupId) removeFromGroup(ctx.id, ctx.groupId); const _a = (window as typeof window & { electronAPI?: { contextMenuClose?: () => void } }).electronAPI; _a?.contextMenuClose?.(); }}
          onUngroup={() => { ungroupAll(ctx.id); const _a = (window as typeof window & { electronAPI?: { contextMenuClose?: () => void } }).electronAPI; _a?.contextMenuClose?.(); }}
        />
      )}

      {/* Inline rename overlay */}
      {renaming && (
        <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/50" onClick={() => setRenaming(null)}>
          <div className="bg-elevated border border-white/[0.1] rounded-xl p-3 w-48 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] text-white/40 mb-2">Rename service</p>
            <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') renameService(renaming, renameVal); if (e.key === 'Escape') setRenaming(null); }}
              className="w-full bg-black/30 border border-white/[0.1] rounded-lg px-2 py-1.5 text-[13px] text-white outline-none focus:border-violet" />
            <div className="flex gap-2 mt-2">
              <button onClick={() => renameService(renaming, renameVal)} className="flex-1 py-1.5 text-[12px] bg-violet rounded-lg text-white font-semibold hover:opacity-90">Save</button>
              <button onClick={() => setRenaming(null)} className="flex-1 py-1.5 text-[12px] bg-white/[0.06] rounded-lg text-white/50 hover:bg-white/10">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// ── SvcBtn ────────────────────────────────────────────────────────────────────
interface SvcBtnProps {
  id: string; index: number; services: Service[];
  active: boolean; disabled: boolean; badge: number;
  onSwitch: (s: Service) => void; onPower: (id: string) => void;
  onCtx: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, i: number) => void;
  onDragEnd:   (e: React.DragEvent) => void;
  onDragOver:  (e: React.DragEvent, i: number, el: Element) => void;
  onDragLeave: (el: Element) => void;
  onDrop:      (e: React.DragEvent, i: number, el: Element) => void;
}
function SvcBtn({ id, index, services, active, disabled, badge, onSwitch, onPower, onCtx, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }: SvcBtnProps) {
  const svc = services.find((s: Service) => s.id === id);
  if (!svc) return null;
  return (
    <div draggable onClick={() => onSwitch(svc)} onContextMenu={onCtx}
      onDragStart={(e: React.DragEvent) => onDragStart(e, index)}
      onDragEnd={(e: React.DragEvent) => onDragEnd(e)}
      onDragOver={(e: React.DragEvent) => onDragOver(e, index, e.currentTarget)}
      onDragLeave={(e: React.DragEvent) => onDragLeave(e.currentTarget)}
      onDrop={(e: React.DragEvent) => onDrop(e, index, e.currentTarget)}
      title={svc.name}
      role="button" tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') onSwitch(svc); }}
      className={['relative flex flex-col items-center justify-center w-full min-h-[56px] rounded-xl border-[1.5px] transition-all gap-1 py-1.5 px-0.5 group overflow-visible cursor-pointer',
        active   ? 'bg-violet/10 border-violet/40 service-active-bar' : 'bg-transparent border-transparent hover:bg-white/[0.04] hover:border-white/[0.12]',
        disabled ? 'opacity-40' : ''].join(' ')}>
      {svc.iconDataUrl
        ? <img src={svc.iconDataUrl} alt={svc.name} className={`w-[30px] h-[30px] object-contain rounded-lg transition-all group-hover:scale-105 ${active ? 'brightness-100' : 'brightness-75 saturate-80 group-hover:brightness-100'}`} />
        : <span className="w-[30px] h-[30px] rounded-lg bg-overlay border border-white/[0.06] flex items-center justify-center text-sm font-bold text-white/40">{svc.name.charAt(0).toUpperCase()}</span>}
      <span className={`text-[9px] font-semibold truncate max-w-full leading-none ${active ? 'text-white/60' : 'text-white/30 group-hover:text-white/50'}`}>{svc.name}</span>
      {badge > 0 && <span className="badge-pop absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose text-white text-[10px] font-bold flex items-center justify-center border-[1.5px] border-void z-10 tabular-nums">{badge > 99 ? '99+' : badge}</span>}
      <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); onPower(id); }} title={disabled ? 'Turn On' : 'Turn Off'}
        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-overlay border border-white/[0.12] text-white/30 hover:text-white/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
        </svg>
      </button>
    </div>
  );
}

// ── GrpBtn ────────────────────────────────────────────────────────────────────
interface GrpBtnProps {
  group: SidebarItem; index: number; services: Service[];
  badges: Record<string, number>; currentId: string | null;
  expanded: boolean; onToggle: () => void;
  onSwitch: (s: Service) => void;
  onCtx: (e: React.MouseEvent) => void;
  onItemCtx: (e: React.MouseEvent, sid: string) => void;
  onDragStart: (e: React.DragEvent, i: number) => void;
  onDragEnd:   (e: React.DragEvent) => void;
  onDragOver:  (e: React.DragEvent, i: number, el: Element) => void;
  onDragLeave: (el: Element) => void;
  onDrop:      (e: React.DragEvent, i: number, el: Element) => void;
}
function GrpBtn({ group, index, services, badges, currentId, expanded, onToggle, onSwitch, onCtx, onItemCtx, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }: GrpBtnProps) {
  const ids     = group.serviceIds || [];
  const preview = ids.slice(0, 4);
  const total   = ids.reduce((acc: number, id: string) => acc + (badges[id] || 0), 0);
  return (
    <div draggable onContextMenu={onCtx}
      onDragStart={(e: React.DragEvent) => onDragStart(e, index)}
      onDragEnd={(e: React.DragEvent) => onDragEnd(e)}
      onDragOver={(e: React.DragEvent) => onDragOver(e, index, e.currentTarget)}
      onDragLeave={(e: React.DragEvent) => onDragLeave(e.currentTarget)}
      onDrop={(e: React.DragEvent) => onDrop(e, index, e.currentTarget)}
      className="relative flex flex-col items-center w-full rounded-xl border-[1.5px] border-transparent hover:border-white/[0.08] transition-all overflow-visible cursor-pointer">
      <button onClick={onToggle} className="relative w-full flex flex-col items-center py-2 gap-1 group">
        <div className="relative w-[44px] h-[44px]">
          {preview.map((id: string, i: number) => {
            const svc = services.find((s: Service) => s.id === id);
            if (!svc) return null;
            return (
              <div key={id} className="absolute rounded-lg overflow-hidden border border-void" style={{ width: 22, height: 22, top: i * 6, left: i * 6, zIndex: preview.length - i }}>
                {svc.iconDataUrl ? <img src={svc.iconDataUrl} alt={svc.name} className="w-full h-full object-contain" /> : <span className="w-full h-full bg-overlay flex items-center justify-center text-[9px] font-bold text-white/40">{svc.name.charAt(0)}</span>}
              </div>
            );
          })}
        </div>
        <span className="text-[9px] font-semibold text-white/30 group-hover:text-white/50 truncate max-w-full">{group.name || 'Group'}</span>
        {total > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose text-white text-[10px] font-bold flex items-center justify-center border-[1.5px] border-void z-10 tabular-nums">{total > 99 ? '99+' : total}</span>}
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 w-full px-1 pb-1">
          {ids.map((id: string) => {
            const svc = services.find((s: Service) => s.id === id);
            if (!svc) return null;
            return (
              <button key={id} onClick={() => onSwitch(svc)} onContextMenu={(e: React.MouseEvent) => onItemCtx(e, id)} title={svc.name}
                className={`relative flex items-center justify-center w-full h-9 rounded-lg border-[1px] transition-all group ${currentId === id ? 'bg-violet/10 border-violet/30' : 'border-transparent hover:bg-white/[0.04]'}`}>
                {svc.iconDataUrl ? <img src={svc.iconDataUrl} alt={svc.name} className="w-5 h-5 object-contain rounded" /> : <span className="text-[10px] font-bold text-white/40">{svc.name.charAt(0)}</span>}
                {(badges[id] || 0) > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-rose text-white text-[8px] font-bold flex items-center justify-center border border-void z-10">{(badges[id] || 0) > 9 ? '9+' : badges[id]}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── CtxMenu ───────────────────────────────────────────────────────────────────
interface CtxMenuProps {
  ctx: CtxMenu; services: Service[]; order: SidebarItem[];
  isDisabled: (id: string) => boolean;
  onClose: () => void; onPower: () => void; onRemove: () => void;
  onRename: () => void; onRemoveFromGroup: () => void; onUngroup: () => void;
}
function CtxMenu({ ctx, services, order, isDisabled, onClose, onPower, onRemove, onRename, onRemoveFromGroup, onUngroup }: CtxMenuProps) {
  const svc   = services.find((s: Service) => s.id === ctx.id);
  const group = order.find((i: SidebarItem) => i.id === ctx.id && i.type === 'group');
  const name  = group ? (group.name || 'Group') : (svc?.name || ctx.id);
  const dis   = svc ? isDisabled(svc.id) : false;
  return (
    <>
      <div className="fixed inset-0 z-[900]" onClick={onClose} />
      <div className="fixed z-[1000] bg-elevated border border-white/[0.12] rounded-xl shadow-lg min-w-[160px] overflow-hidden modal-pop py-1"
        style={{ top: Math.min(ctx.y, window.innerHeight - 220), left: ctx.x + 8 }}>
        <div className="px-3 py-2 border-b border-white/[0.06]">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/30 truncate">{name}</p>
        </div>
        {ctx.type === 'service' && svc && (<>
          <MI icon="⏻" label={dis ? 'Turn On' : 'Turn Off'} color={dis ? 'text-emerald' : 'text-amber'} onClick={onPower} />
          <div className="border-t border-white/[0.06] my-0.5" />
          <MI icon="✏" label="Rename" onClick={onRename} />
          {ctx.groupId && <MI icon="⊟" label="Remove from Group" onClick={onRemoveFromGroup} />}
          <div className="border-t border-white/[0.06] my-0.5" />
          <MI icon="✕" label="Remove" color="text-rose/70 hover:text-rose" onClick={onRemove} />
        </>)}
        {ctx.type === 'group' && (<>
          <MI icon="✏" label="Rename Group" onClick={onRename} />
          <MI icon="⊞" label="Ungroup" onClick={onUngroup} />
        </>)}
      </div>
    </>
  );
}

function MI({ icon, label, color, onClick }: { icon: string; label: string; color?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-medium transition-colors hover:bg-white/[0.06] ${color || 'text-white/70'}`}>
      <span className="w-4 text-center opacity-70 flex-shrink-0">{icon}</span>{label}
    </button>
  );
}
