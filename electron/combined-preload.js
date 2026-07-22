// Combined preload: notification intercept + DOM badge polling
const { ipcRenderer } = require('electron');
console.log('[preload] combined-preload.js loaded on', location.hostname);

// Bail out entirely on auth pages — any DOM interference breaks login form POSTs
const _authHosts = ['login.microsoftonline.com', 'login.live.com', 'account.microsoft.com', 'accounts.google.com', 'login.google.com'];
const _isAuthHost = _authHosts.some(h => location.hostname.includes(h)) || (location.hostname.startsWith('login.') && !location.hostname.includes('discord'));
if (_isAuthHost) {
  console.log('[preload] auth page detected — skipping all injection');
  // Only expose the absolute minimum needed for IPC (nothing that touches DOM)
} else {

// ── Ctrl+click → open in system browser ──────────────────────────────────────
document.addEventListener('click', function(e) {
  if (!e.ctrlKey && !e.metaKey) return;
  let el = e.target;
  while (el && el.tagName !== 'A') el = el.parentElement;
  if (!el) return;
  const href = el.href || el.getAttribute('href');
  if (!href || (!href.startsWith('http://') && !href.startsWith('https://'))) return;
  e.preventDefault();
  e.stopPropagation();
  ipcRenderer.send('open-external-url', { url: href });
}, true);

// ── Notification intercept ────────────────────────────────────────────────────
(function interceptNotifications() {
  const authHostnames = [
    'login.microsoftonline.com', 'login.live.com', 'account.microsoft.com',
    'accounts.google.com', 'login.google.com',
  ];
  const isAuthPage = authHostnames.some(h => location.hostname.includes(h)) ||
    (location.hostname.includes('login.') && !location.hostname.includes('discord')) ||
    location.pathname.includes('/oauth');
  if (isAuthPage) return;

  function forwardNotification(title, options) {
    console.log(`[preload] forwardNotification title="${title}" body="${(options && options.body) || ''}"`);
    ipcRenderer.send('web-notification', {
      title: title || '',
      body: (options && options.body) || '',
      icon: (options && options.icon) || '',
    });
  }

  function FakeNotification(title, options) {
    forwardNotification(title, options);
    return { close: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
  }
  FakeNotification.permission = 'granted';
  FakeNotification.requestPermission = () => Promise.resolve('granted');
  Object.defineProperty(FakeNotification, 'permission', { get: () => 'granted', configurable: true });

  try {
    Object.defineProperty(window, 'Notification', {
      get: () => FakeNotification,
      set: () => {},
      configurable: false,
      enumerable: true,
    });
    console.log('[preload] window.Notification locked to FakeNotification');
  } catch(e) {
    try { window.Notification = FakeNotification; } catch(e2) {}
  }

  function patchSWPrototype() {
    try {
      ServiceWorkerRegistration.prototype.showNotification = function(title, options) {
        forwardNotification(title, options);
      };
    } catch(e) {}
  }
  patchSWPrototype();

  if (!isAuthPage && navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(() => patchSWPrototype()).catch(() => {});
  }

  if (!isAuthPage) {
    try {
      const origRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = function(...args) {
        return origRegister(...args).then(reg => { patchSWPrototype(); return reg; });
      };
    } catch(e) {}
  }

  try {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data;
      if (!data) return;
      if (location.hostname.includes('discord.com')) {
        console.log('[preload] SW message raw:', JSON.stringify(data).slice(0, 300));
      }
      const title = data.title || data.notification?.title || (data.type === 'notification' ? data.message : null);
      const body = data.body || data.notification?.body || '';
      if (title) forwardNotification(title, { body });
    });
  } catch(e) {}
})();

// ── DOM badge detection ───────────────────────────────────────────────────────
(function startBadgeDetection() {
  const host = location.hostname;

  // Track whether this view is currently visible — main sends 'view-visibility' on show/hide
  let viewVisible = true;
  ipcRenderer.on('view-visibility', (event, { visible }) => {
    viewVisible = visible;
    // No observer disconnect/reconnect — observers stay alive always.
    // checkAndSend/checkGmailCount already gate on viewVisible.
  });

  function getCount() {
    try {
      if (host.includes('web.telegram.org')) {
        let total = 0;
        // Primary: non-empty badge-20 elements (excludes is-badge-empty)
        document.querySelectorAll('.badge.badge-20:not(.is-badge-empty)').forEach(el => {
          if (el.classList.contains('back-unread-badge')) return; // skip back-button badge
          const n = parseInt(el.textContent.trim());
          if (!isNaN(n) && n > 0) total += n;
        });
        if (total > 0) return total;
        // Fallback: older selectors
        document.querySelectorAll('.unread-count, .chatlist-badge, .dialogs-badge').forEach(el => {
          if (el.offsetParent === null) return;
          const n = parseInt(el.textContent.trim());
          if (!isNaN(n) && n > 0) total += n;
        });
        return total;
      }

      if (host.includes('chat.google.com') || host.includes('mail.google.com')) {
        let total = 0;
        const seen = new Set();
        document.querySelectorAll('[aria-label*="unread"]').forEach(el => {
          if ([...seen].some(s => s.contains(el))) return;
          seen.add(el);
          const m = el.getAttribute('aria-label').match(/(\d+)\s*unread/i);
          total += m ? parseInt(m[1]) : 1;
        });
        return total;
      }

      if (host.includes('discord.com')) {
        const titleMatch = document.title.match(/^\((\d+)\)/);
        if (titleMatch) return parseInt(titleMatch[1]);
        let total = 0;
        document.querySelectorAll('[class*="numberBadge"], [class*="unreadMentionsIndicator"]').forEach(el => {
          if (el.offsetParent === null) return;
          const n = parseInt(el.textContent.trim());
          if (!isNaN(n) && n > 0) total += n;
        });
        return total;
      }

      if (host.includes('app.slack.com')) {
        let total = 0;
        document.querySelectorAll('.p-channel_sidebar__badge, .c-badge, [data-qa="badge"]').forEach(el => {
          if (el.offsetParent === null) return;
          const n = parseInt(el.textContent.trim());
          if (!isNaN(n) && n > 0) total += n;
        });
        if (total === 0) {
          total = document.querySelectorAll(
            '.p-channel_sidebar__channel--unread, .p-channel_sidebar__link--unread'
          ).length;
        }
        return total;
      }
    } catch(e) {}
    return -1;
  }

  // ── Gmail ─────────────────────────────────────────────────────────────────
  if (host.includes('mail.google.com')) {
    let lastGmailCount = 0;
    let gmailObserver = null;
    let gmailTitleObserver = null;
    let gmailInterval = null;

    function getGmailCount() {
      const m = document.title.match(/\((\d+)\)/);
      if (m) return parseInt(m[1]);
      return document.querySelectorAll('tr.zA').length;
    }

    function checkGmailCount() {
      const count = getGmailCount();
      if (count !== lastGmailCount) { lastGmailCount = count; ipcRenderer.send('dom-badge-count', { count }); }
    }

    let gmailDebounce = null;
    function scheduleGmailCheck() {
      clearTimeout(gmailDebounce);
      gmailDebounce = setTimeout(checkGmailCount, 600);
    }

    function pauseObserver() { /* kept for compat — observers stay connected */ }
    function resumeObserver() { /* kept for compat — observers stay connected */ }
    function attachGmailObserver() {
      checkGmailCount();
      const titleEl = document.querySelector('title');
      if (titleEl) {
        gmailTitleObserver = new MutationObserver(checkGmailCount);
        gmailTitleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
      gmailObserver = new MutationObserver(scheduleGmailCheck);
      gmailObserver.observe(document.body, { childList: true, subtree: true });
      // Polling fallback every 8s (reduced from 5s — title observer covers most cases)
      gmailInterval = setInterval(checkGmailCount, 8000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(attachGmailObserver, 1500));
    } else {
      setTimeout(attachGmailObserver, 1500);
    }
    return;
  }

  // Only run for services that need DOM detection
  if (!host.includes('web.telegram.org') && !host.includes('chat.google.com') &&
      !host.includes('app.slack.com') &&
      !host.includes('discord.com')) return;

  // ── General services (Telegram, GChat, Slack, Discord) ───────────────────
  let lastCount = 0;
  let debounceTimer = null;
  let bodyObserver = null;
  let generalInterval = null;

  function pauseObserver() { /* kept for compat — observers stay connected */ }
  function resumeObserver() { /* kept for compat — observers stay connected */ }

  function getDiscordSenderAndBody() {
    try {
      const badges = document.querySelectorAll('[class*="lowerBadge_"], [class*="numberBadge_"]');
      for (const badge of badges) {
        const n = parseInt(badge.textContent.trim());
        if (isNaN(n) || n <= 0) continue;
        const listItem = badge.closest('[class*="listItem_"]');
        if (!listItem) continue;
        const raw = (listItem.innerText || '').split(',')[0].trim();
        if (raw && raw.length > 0 && raw.length < 50) return { sender: raw, body: 'New message' };
      }
    } catch(e) {}
    return { sender: null, body: null };
  }

  let discordUsernameSent = false;
  function tryDetectDiscordUsername() {
    if (discordUsernameSent) return;
    try {
      const el = document.querySelector('[class*="nameTag_"]');
      if (!el) return;
      const name = el.innerText.split('\n')[0].trim();
      if (name && name.length > 0 && name.length < 40) {
        discordUsernameSent = true;
        ipcRenderer.send('discord-username-detected', { name });
      }
    } catch(e) {}
  }

  let serviceUsernameSent = false;
  function tryDetectServiceUsername() {
    if (serviceUsernameSent || host.includes('discord.com')) return;
    try {
      let name = null;
      if (host.includes('chat.google.com') || host.includes('mail.google.com')) {
        const el = document.querySelector('.gb_lb, .gb_mb, a[aria-label*="Google Account"] .gb_A');
        if (el) name = el.textContent.trim();
        if (!name) { const img = document.querySelector('img.gb_P, a[aria-label*="Google Account"] img'); if (img) name = (img.getAttribute('alt') || '').trim(); }
      }
      if (host.includes('app.slack.com')) {
        const el = document.querySelector('[data-qa="user-display-name"], .p-ia4_user_button__display_name');
        if (el) name = el.textContent.trim();
      }
      if (host.includes('teams.live.com') || host.includes('teams.microsoft.com')) {
        const el = document.querySelector('[data-tid="me-control-display-name"], .profile-card-name');
        if (el) name = el.textContent.trim();
      }
      if (host.includes('web.whatsapp.com')) {
        const el = document.querySelector('span[data-testid="profile-name"], header span[dir="auto"]');
        if (el) name = el.textContent.trim();
      }
      if (host.includes('web.telegram.org')) {
        const el = document.querySelector('.profile-name, .user-title, [class*="ProfileName"]');
        if (el) name = el.textContent.trim();
      }
      if (name && name.length > 0 && name.length < 60) {
        serviceUsernameSent = true;
        ipcRenderer.send('service-username-detected', { name });
      }
    } catch(e) {}
  }

  function checkAndSend() {
    const count = getCount();
    if (host.includes('discord.com')) tryDetectDiscordUsername();
    else tryDetectServiceUsername();
    if (count >= 0 && count !== lastCount) {
      lastCount = count;
      if (host.includes('discord.com') && count > 0) {
        const { sender, body } = getDiscordSenderAndBody();
        ipcRenderer.send('dom-badge-count', { count, sender, body });
      } else {
        ipcRenderer.send('dom-badge-count', { count });
      }
    }
  }

  function scheduleCheck() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(checkAndSend, 500);
  }

  function attachObserver() {
    checkAndSend();

    if (host.includes('discord.com')) {
      setTimeout(tryDetectDiscordUsername, 3000);
      setTimeout(tryDetectDiscordUsername, 6000);
    } else {
      setTimeout(tryDetectServiceUsername, 2000);
      setTimeout(tryDetectServiceUsername, 5000);
    }

    // Narrowed observer: childList+subtree only — drops characterData and attributes
    // which fire constantly in SPAs and aren't needed for badge count detection
    bodyObserver = new MutationObserver(scheduleCheck);
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Polling fallback every 8s (reduced from continuous — observer covers real-time)
    generalInterval = setInterval(checkAndSend, 8000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(attachObserver, 2000));
  } else {
    setTimeout(attachObserver, 2000);
  }
})();

} // end: non-auth page guard
