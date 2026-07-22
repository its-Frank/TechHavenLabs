/**
 * Safe accessor for window.electronAPI.
 * Returns undefined when running in a plain browser (SSR / storybook / tests).
 */
export function useElectron() {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { electronAPI?: Window['electronAPI'] }).electronAPI;
}
