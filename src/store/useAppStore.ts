/**
 * Central app state using React context + useReducer.
 * No external state library — keeps the bundle small for an Electron app.
 */
import { createContext, useContext, useReducer, Dispatch } from 'react';
import type { Service, SidebarItem, AppSettings } from '../types/electron';

// ── State shape ───────────────────────────────────────────────────────────────
export interface AppState {
  services:         Service[];
  sidebarOrder:     SidebarItem[] | null;
  currentAccountId: string | null;
  offPageServiceId: string | null;   // service showing the "turned off" page
  settings:         AppSettings;
  badgeCounts:      Record<string, number>;
  memoryMb:         number;
  networkOnline:    boolean;
  networkMbps:      number;
  disabledServices: Set<string>;
}

const DEFAULT_STATE: AppState = {
  services:         [],
  sidebarOrder:     null,
  currentAccountId: null,
  offPageServiceId: null,
  settings:         {},
  badgeCounts:      {},
  
  memoryMb:         0,
  networkOnline:    true,
  networkMbps:      0,
  disabledServices: new Set(),
};

// ── Actions ───────────────────────────────────────────────────────────────────
export type Action =
  | { type: 'SET_SERVICES';       payload: Service[] }
  | { type: 'SET_SIDEBAR_ORDER';  payload: SidebarItem[] | null }
  | { type: 'SET_CURRENT';        payload: string | null }
  | { type: 'SET_OFF_PAGE';       payload: string | null }
  | { type: 'SET_SETTINGS';       payload: AppSettings }
  | { type: 'SET_BADGE';          payload: { accountId: string; count: number } }
  
  | { type: 'SET_MEMORY';         payload: number }
  | { type: 'SET_NETWORK';        payload: { online: boolean; mbps: number } }
  | { type: 'TOGGLE_DISABLED';    payload: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SERVICES':      return { ...state, services: action.payload };
    case 'SET_SIDEBAR_ORDER': return { ...state, sidebarOrder: action.payload };
    case 'SET_CURRENT':       return { ...state, currentAccountId: action.payload };
    case 'SET_OFF_PAGE':      return { ...state, offPageServiceId: action.payload };
    case 'SET_SETTINGS':      return {
      ...state,
      settings: action.payload,
      disabledServices: new Set(action.payload.disabledServices || []),
    };
    case 'SET_BADGE': {
      const count = action.payload.count;
      return { ...state, badgeCounts: { ...state.badgeCounts, [action.payload.accountId]: count } };
    }
    
    case 'SET_MEMORY':    return { ...state, memoryMb: action.payload };
    case 'SET_NETWORK':   return { ...state, networkOnline: action.payload.online, networkMbps: action.payload.mbps };
    case 'TOGGLE_DISABLED': {
      const next = new Set(state.disabledServices);
      if (next.has(action.payload)) next.delete(action.payload);
      else next.add(action.payload);
      return { ...state, disabledServices: next };
    }
    default: return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────
export const AppStateCtx    = createContext<AppState>(DEFAULT_STATE);
export const AppDispatchCtx = createContext<Dispatch<Action>>(() => {});

export function useAppState()    { return useContext(AppStateCtx); }
export function useAppDispatch() { return useContext(AppDispatchCtx); }

export { reducer, DEFAULT_STATE };
