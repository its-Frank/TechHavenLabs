import { useEffect } from 'react';

/**
 * Expands the titlebarView to full-window when a modal opens,
 * and shrinks it back to titlebar strip when it closes.
 */
export function useModal(open: boolean) {
  useEffect(() => {
    const api = (window as typeof window & { electronAPI?: { modalOpen?: () => void; modalClose?: () => void } }).electronAPI;
    if (open) {
      api?.modalOpen?.();
    } else {
      api?.modalClose?.();
    }
  }, [open]);
}
