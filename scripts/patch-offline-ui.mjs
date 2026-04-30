// patch-offline-ui.mjs
// Applies two precise changes to App.tsx:
//   1. Replace the top-blocking offline/sync banner with a dismissible bottom pill
//   2. Add a yellow offline dot next to the "WORSHIP" sidebar section label

import { readFileSync, writeFileSync } from 'fs';

const FILE = '/Users/jay/Downloads/remix_-worshipflow (1)/src/App.tsx';
let src = readFileSync(FILE, 'utf8');

// ─── PATCH 1: Replace network status block + old banner ──────────────────────
const OLD_NETWORK = `  // ── Network / Offline status ──────────────────────────────────────────────
  const { isOnline, mode: networkMode } = useNetworkStatus();
  // Show "Syncing" pill for max 4s so it doesn't linger when server confirms quickly
  const [showSyncDone, setShowSyncDone] = React.useState(false);
  useEffect(() => {
    if (networkMode === 'online' && !isOnline) return; // skip initial render
    if (networkMode === 'syncing') {
      setShowSyncDone(false);
    } else if (networkMode === 'online') {
      // Brief "All synced ✓" flash when coming back online
      setShowSyncDone(true);
      const t = setTimeout(() => setShowSyncDone(false), 3000);
      return () => clearTimeout(t);
    }
  }, [networkMode]);

  return (
    <div className="flex h-screen wf-page-bg font-sans text-gray-900 dark:text-gray-100 overflow-hidden">

      {/* 📶 Offline / Sync status banner — slides in when internet is lost or writes are pending */}
      {(!isOnline || networkMode === 'syncing' || showSyncDone) && (
        <div
          className="fixed top-0 left-0 right-0 z-[200] flex justify-center pointer-events-none"
          style={{ animation: 'slideDown 0.3s ease' }}
        >
          <div
            className={\`mt-3 px-4 py-2 rounded-full shadow-lg border text-xs font-semibold flex items-center gap-2 pointer-events-auto transition-all \${
              !isOnline
                ? 'bg-amber-500/95 border-amber-400/50 text-white shadow-amber-500/30'
                : showSyncDone
                ? 'bg-emerald-600/95 border-emerald-500/50 text-white shadow-emerald-500/30'
                : 'bg-indigo-600/95 border-indigo-500/50 text-white shadow-indigo-500/30'
            }\`}
            style={{ backdropFilter: 'blur(8px)' }}
          >
            {!isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white opacity-90 animate-pulse" />
                You're offline — changes will sync when reconnected
              </>
            ) : showSyncDone ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                All changes synced
              </>
            ) : (
              <>
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>
                Syncing…
              </>
            )}
          </div>
        </div>
      )}`;

const NEW_NETWORK = `  // ── Network / Offline status ──────────────────────────────────────────────
  const { isOnline } = useNetworkStatus();
  // Allow user to dismiss the offline banner (X button or swipe up to dismiss)
  const [offlineDismissed, setOfflineDismissed] = React.useState(false);
  // Re-show automatically every time connection drops again
  useEffect(() => { if (!isOnline) setOfflineDismissed(false); }, [isOnline]);
  const showOfflineBanner = !isOnline && !offlineDismissed;

  // Touch swipe-up-to-dismiss on the offline pill
  const offlinePillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = offlinePillRef.current;
    if (!el) return;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
    const onTouchEnd   = (e: TouchEvent) => {
      if (startY - e.changedTouches[0].clientY > 40) setOfflineDismissed(true);
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [showOfflineBanner]);

  return (
    <div className="flex h-screen wf-page-bg font-sans text-gray-900 dark:text-gray-100 overflow-hidden">

      {/* 📶 Offline pill — bottom-centre, never blocks top nav, tap X or swipe up to dismiss */}
      {showOfflineBanner && (
        <div
          ref={offlinePillRef}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto"
          style={{ animation: 'slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1)' }}
        >
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-xl border border-amber-400/40 text-xs font-semibold text-white select-none"
            style={{
              background: 'rgba(180,83,9,0.92)',
              backdropFilter: 'blur(12px)',
              boxShadow: '0 4px 24px rgba(180,83,9,0.35)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse shrink-0" />
            <span>You're offline — data saved locally</span>
            <button
              onClick={() => setOfflineDismissed(true)}
              aria-label="Dismiss offline banner"
              className="ml-1 p-0.5 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}`;

// ─── PATCH 2: Sidebar "Worship" label → add offline dot ─────────────────────
const OLD_SIDEBAR = `          {!isSidebarCollapsed && (
            <p className="px-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 mt-1">Worship</p>
          )}`;

const NEW_SIDEBAR = `          {!isSidebarCollapsed && (
            <div className="flex items-center gap-2 px-3 mb-1.5 mt-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Worship</p>
              {/* Yellow offline dot — visible only when offline, completely hidden when online */}
              {!isOnline && (
                <span
                  className="w-2 h-2 rounded-full bg-yellow-400 shrink-0 animate-pulse"
                  style={{ boxShadow: '0 0 6px rgba(250,204,21,0.9)' }}
                  title="You're offline"
                />
              )}
            </div>
          )}`;

// Apply patches
if (!src.includes(OLD_NETWORK)) { console.error('❌ PATCH 1 target not found'); process.exit(1); }
if (!src.includes(OLD_SIDEBAR)) { console.error('❌ PATCH 2 target not found'); process.exit(1); }

src = src.replace(OLD_NETWORK, NEW_NETWORK);
src = src.replace(OLD_SIDEBAR, NEW_SIDEBAR);

writeFileSync(FILE, src, 'utf8');
console.log('✅ App.tsx patched successfully');
