export interface Service {
  id: string;
  name: string;
  url: string;
  iconDataUrl?: string;
}

export interface SidebarItem {
  type: 'service' | 'group';
  id: string;
  name?: string;
  serviceIds?: string[];
}

export interface LicenseInfo {
  hasLicense: boolean;
  valid?: boolean;
  inTrial: boolean;
  trialDaysLeft: number;
  daysLeft?: number;
  plan?: string;
  expiresAt?: string;
  email?: string;
  deviceId: string;
  reason?: string;
}

export interface AppSettings {
  disabledServices?: string[];
  destroyViewsOnSwitch?: boolean;
  hardwareAcceleration?: boolean;
  memoryLimit?: number;
  // blocking features removed
}

export interface ElectronAPI {
  // Views
  createView:  (args: { accountId: string; url: string; partition: string; forceReload?: boolean }) => Promise<{ success: boolean }>;
  switchView:  (args: { accountId: string }) => Promise<{ success: boolean }>;
  destroyView: (args: { accountId: string }) => Promise<{ success: boolean }>;
  reloadView:  (args: { accountId: string }) => Promise<{ success: boolean }>;

  // Services / Settings
  getSettings:       () => Promise<AppSettings>;
  saveSettings:      (s: AppSettings) => Promise<{ success: boolean }>;
  getUserServices:   () => Promise<Service[]>;
  saveUserServices:  (s: Service[]) => Promise<{ success: boolean }>;
  getSidebarOrder:   () => Promise<SidebarItem[] | null>;
  saveSidebarOrder:  (o: SidebarItem[]) => Promise<{ success: boolean }>;
  clearCache:        (partition?: string) => Promise<{ success: boolean }>;
  removeServiceData: (args: { accountId: string; partition: string }) => Promise<{ success: boolean }>;
  fetchFavicon:      (args: { url: string }) => Promise<{ dataUrl: string | null }>;
  pickIconFile:      () => Promise<{ dataUrl: string | null }>;

  // Data backup/restore
  scanJunkUserdata:   () => Promise<{ files: Array<{path:string;name:string;size:number}>; dirs: Array<{path:string;name:string;isCache?:boolean}>; totalBytes: number }>;
  deleteJunkUserdata: (args: { files: unknown[]; dirs: unknown[] }) => Promise<{ deleted: number }>;
  backupData:         (args: { serviceIds?: string[] }) => Promise<{ success?: boolean; canceled?: boolean; backupDir?: string; services?: string[]; error?: string }>;
  restoreDataScan:    () => Promise<{ success?: boolean; canceled?: boolean; backupDir?: string; services?: Service[]; error?: string }>;
  restoreData:        (args: { backupDir: string; serviceIds?: string[] }) => Promise<{ success: boolean }>;
  relunchApp:         () => Promise<void>;

  // Blocking features removed

  // License
  getLicenseInfo:    () => Promise<LicenseInfo>;
  activateLicense:   (filePath: string) => Promise<{ success: boolean; error?: string }>;
  deactivateLicense: () => Promise<{ success: boolean }>;
  selectLicenseFile: () => Promise<{ success: boolean; error?: string }>;

  // Window
  minimize: () => void;
  maximize: () => void;
  close:    () => void;

  // Misc
  openExternal:    (url: string) => void;
  reportLayout:    (d: { titlebarHeight: number; sidebarWidth: number }) => void;
  toggleServiceOn: (id: string) => void;
  suppressBadge:   (args: { accountId: string; count: number }) => void;
  showOffPage:     (id: string | null) => void;

  // Events
  on: (
    channel: 'badge-count' | 'memory-update' |
         'network-update' | 'window-resized' | 'service-toggled' | 'focus-service' |
             'open-settings' | 'switch-to-service' | 'show-off-page',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: (...args: any[]) => void
  ) => (() => void) | undefined;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
