'use client';

import { useState, useEffect, useMemo } from 'react';

const TOPICS = [
  {
    title: 'Getting Started',
    items: [
      { q: 'How do I add a service?', a: 'Click the + button at the bottom of the sidebar, then pick a preset or enter a custom URL.' },
      { q: 'How do I add a second account?', a: 'Right-click any sidebar icon → "Add Account". Each account gets its own isolated session so they never share cookies or logins.' },
      { q: 'How do I switch between services?', a: 'Click the icon in the sidebar, or use Ctrl+1 through Ctrl+9 for the first 9 services.' },
    ],
  },
  {
    title: 'Privacy & Blocking',
    items: [
      { q: 'Privacy', a: 'The app does not send your service images or content to external servers for blocking. Notification endpoints are whitelisted so messages arrive reliably.' },
    ],
  },
  {
    title: 'Notifications',
    items: [
      { q: 'Why do notifications show in the app instead of the system tray?', a: 'The app intercepts web notifications and routes them through its own toast system so they work consistently across all services, even when the window is focused.' },
      { q: 'What do the red badges on sidebar icons mean?', a: 'Unread message counts — read directly from the service\'s DOM or page title. They update in real time.' },
    ],
  },
  {
    title: 'Performance',
    items: [
      { q: 'The app is using a lot of RAM. What can I do?', a: 'Enable "Destroy views on switch" in Settings — this frees a service\'s memory when you switch away. You can also clear caches from Settings → Data.' },
      { q: 'Can I turn off a service without removing it?', a: 'Yes. Hover any sidebar icon and click the power button, or right-click → Turn Off. The service uses zero memory while off.' },
    ],
  },
  {
    title: 'License',
    items: [
      { q: 'How do I activate a license?', a: 'Click Settings → License (or the license icon), copy your Device ID, send it to the seller, then drag the .key file you receive into the activation window.' },
      { q: 'How long is the free trial?', a: '30 days from first launch. All features are fully available during the trial.' },
      { q: 'Is the license tied to my machine?', a: 'Yes. Licenses are device-bound using a fingerprint of your hardware. Contact the seller to transfer to a new machine.' },
    ],
  },
  {
    title: 'Keyboard Shortcuts',
    items: [
      { q: 'What shortcuts are available?', a: 'Ctrl+, — Settings\nF12 — Open DevTools for current service\nCtrl+1-9 — Switch to service by position' },
    ],
  },
];

export default function HelpModal() {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Expand titlebarView to full window when open
  useEffect(() => {
    const api = (window as typeof window & { electronAPI?: { modalOpen?: () => void; modalClose?: () => void } }).electronAPI;
    if (open) api?.modalOpen?.(); else api?.modalClose?.();
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') setOpen(v => !v);
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    (window as typeof window & { __openHelp?: () => void }).__openHelp = () => setOpen(true);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return TOPICS;
    const q = search.toLowerCase();
    return TOPICS.map(t => ({
      ...t,
      items: t.items.filter(i => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q)),
    })).filter(t => t.items.length > 0);
  }, [search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1000]">
      <div className="modal-pop bg-surface border border-white/[0.06] rounded-2xl w-[560px] max-w-[92vw] max-h-[88vh] overflow-hidden shadow-lg flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl bg-blue-400/10 flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 className="text-[16px] font-bold flex-1">Help &amp; Guide</h2>
          <button onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/[0.06] text-white/30 hover:bg-rose/10 hover:border-rose/30 hover:text-rose flex items-center justify-center transition-colors">
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-white/[0.06]">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search topics…"
            className="w-full bg-elevated border border-white/[0.06] focus:border-violet rounded-xl px-3 py-2.5 text-[13px] outline-none transition-all placeholder:text-white/20"
            autoFocus
          />
        </div>

        {/* Topics */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {filtered.length === 0 && (
            <p className="text-center text-white/30 text-sm py-8">No results for &ldquo;{search}&rdquo;</p>
          )}
          {filtered.map(topic => (
            <div key={topic.title}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/25 px-2 py-2 mt-2">{topic.title}</p>
              {topic.items.map(item => (
                <div key={item.q} className="rounded-xl border border-transparent hover:border-white/[0.06] overflow-hidden transition-colors">
                  <button
                    onClick={() => setExpanded(expanded === item.q ? null : item.q)}
                    className="w-full text-left px-3 py-3 flex items-center justify-between gap-2 group"
                  >
                    <span className="text-[13px] font-medium text-white/70 group-hover:text-white/90 transition-colors">{item.q}</span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`flex-shrink-0 text-white/20 transition-transform ${expanded === item.q ? 'rotate-180' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {expanded === item.q && (
                    <div className="px-3 pb-3">
                      <p className="text-[12px] text-white/50 leading-relaxed whitespace-pre-line bg-elevated rounded-xl p-3">
                        {item.a}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
