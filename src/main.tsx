import { StrictMode, useState, useEffect, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// import './themes/one-monokai.css'; // reserved
// import './themes/nord.css';         // reserved
import './themes/nordvpn.css';
import './themes/glass.css';
import { ThemeProvider } from './ThemeContext.tsx';
import { AuthProvider, useAuth } from './AuthContext.tsx';
import LoginPage from './LoginPage.tsx';
import AccessDenied from './AccessDenied.tsx';
import SplashScreen from './SplashScreen.tsx';

const EventRegistrationPage    = lazy(() => import('./EventRegistrationPage.tsx'));
const EventDashboardPage       = lazy(() => import('./EventDashboardPage.tsx'));
const InternalContributionPage = lazy(() => import('./InternalContributionPage.tsx'));
const InternalMemberFormPage   = lazy(() => import('./InternalMemberFormPage.tsx'));
const PublicPlaylistPage       = lazy(() => import('./PublicPlaylistPage.tsx'));
const LiveDisplayPage          = lazy(() => import('./LiveDisplayPage.tsx'));
const LiveDisplayLocalPage     = lazy(() => import('./LiveDisplayLocalPage.tsx'));

// Returning users skip the full splash — first visit gets brand impression, repeat visits feel instant
const isReturning = (() => { try { return !!sessionStorage.getItem('wf_visited'); } catch { return false; } })();
const MIN_SPLASH_MS = isReturning ? 400 : 1600;
try { sessionStorage.setItem('wf_visited', '1'); } catch { /* noop */ }

// ── Service Worker registration with auto-update ──────────────────────────────
// Strategy: register SW silently; only trigger a page reload when a brand-new
// SW activates WHILE the page is already open (not on every fresh page load).
// Guards:
//   • hadController  — skip reload on very first SW install (no old SW to replace)
//   • pageAgeOk      — skip reload in first 8s (splash screen still visible)
//   • reloadCooldown — skip if we reloaded within the last 60s (prevents loops)
//   • localStorage   — cooldown survives hard-reloads (sessionStorage gets cleared)
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  const pageOpenedAt  = Date.now();

  // 60-second cooldown stored in localStorage so it survives page reloads.
  const SW_RELOAD_KEY  = 'wf_sw_last_reload';
  const lastReload     = parseInt(localStorage.getItem(SW_RELOAD_KEY) ?? '0', 10);
  const reloadCooldown = Date.now() - lastReload < 60_000;

  navigator.serviceWorker.register('/sw.js').then(reg => {
    // ── DO NOT call SKIP_WAITING on reg.waiting here ──
    // If a SW is already waiting from a previous deploy, let it activate naturally
    // on the NEXT page open — calling postMessage here triggers an immediate
    // controllerchange → reload() which is the main cause of the flicker.

    // Only activate a SW that installs WHILE this page session is open.
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener('statechange', () => {
        // SW installed & there's already an active controller → safe to activate
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          newSW.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch(() => { /* SW registration failed silently */ });

  // controllerchange = new SW just took control. Reload to load fresh assets.
  // All three guards must pass to prevent flicker / infinite loops.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const pageAgeOk = Date.now() - pageOpenedAt > 8_000; // splash must be gone
    if (hadController && !refreshing && !reloadCooldown && pageAgeOk) {
      refreshing = true;
      try { localStorage.setItem(SW_RELOAD_KEY, String(Date.now())); } catch { /* noop */ }
      window.location.reload();
    }
  });
}



function Root() {
  const { status } = useAuth();
  // Two gates: timer elapsed + auth resolved — splash closes only when BOTH are true
  const [timerDone, setTimerDone] = useState(false);
  const [visible, setVisible] = useState(true); // controls the fade

  const authResolved = status !== 'loading';

  // Start the minimum display timer once
  useEffect(() => {
    const t = setTimeout(() => setTimerDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  // When both gates pass → start fade-out (guard with `visible` to fire only once)
  useEffect(() => {
    if (timerDone && authResolved && visible) {
      const t = setTimeout(() => setVisible(false), 450);
      return () => clearTimeout(t);
    }
  }, [timerDone, authResolved, visible]);

  // ── Public event registration — bypass auth entirely ──────────────────────
  // Supports BOTH path-based (/r/EVENT_ID) and query-param (?event=ID) routing.
  // Path-based is the PREFERRED form for shared links: iOS PWA standalone mode
  // silently drops query params from shared URLs but always preserves the path.
  const params        = new URLSearchParams(window.location.search);
  const pathname      = window.location.pathname;

  // Path-based: /r/EVENT_ID  → registration
  //             /d/EVENT_ID  → dashboard
  //             /p/SLUG      → public playlist
  const pathRegMatch  = pathname.match(/^\/r\/([^/?#]+)/);
  const pathDashMatch = pathname.match(/^\/d\/([^/?#]+)/);
  const pathPlayMatch = pathname.match(/^\/p\/([^/?#]+)/);

  const publicEventId = pathRegMatch?.[1] ?? pathDashMatch?.[1] ?? params.get('event');
  const publicRegId   = params.get('registrant') ?? undefined;
  // Determine view: path-based takes priority over query param
  const publicView    = pathDashMatch ? 'dashboard' : params.get('view');
  const publicPlaylistSlug = pathPlayMatch?.[1] ?? null;

  // ── Public live-display: /live-display (no auth required, used by OBS) ──
  const isLiveDisplay      = pathname === '/live-display';
  const isLiveDisplayLocal = pathname === '/live-display-local';
  if (isLiveDisplayLocal) {
    return (
      <Suspense fallback={<div style={{ background: 'transparent', width: '100vw', height: '100vh' }} />}>
        <LiveDisplayLocalPage />
      </Suspense>
    );
  }
  if (isLiveDisplay) {
    return (
      <Suspense fallback={<div style={{ background: 'transparent', width: '100vw', height: '100vh' }} />}>
        <LiveDisplayPage />
      </Suspense>
    );
  }

  const fallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#030712' }}>
      <div style={{ width: 32, height: 32, border: '3px solid transparent', borderTopColor: '#6d28d9', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  // ── Public playlist: /p/:slug ───────────────────────────────────────────
  if (publicPlaylistSlug) {
    return (
      <Suspense fallback={fallback}>
        <PublicPlaylistPage slug={publicPlaylistSlug} />
      </Suspense>
    );
  }

  if (publicEventId && publicView === 'dashboard') {
    return (
      <Suspense fallback={fallback}>
        <EventDashboardPage eventId={publicEventId} />
      </Suspense>
    );
  }

  if (publicEventId && publicView === 'collector') {
    const collectorToken = params.get('token') ?? '';
    return (
      <Suspense fallback={fallback}>
        <InternalContributionPage eventId={publicEventId} token={collectorToken} />
      </Suspense>
    );
  }

  if (publicEventId && publicView === 'member-register') {
    return (
      <Suspense fallback={fallback}>
        <InternalMemberFormPage />
      </Suspense>
    );
  }

  if (publicEventId) {
    return (
      <Suspense fallback={fallback}>
        <EventRegistrationPage eventId={publicEventId} registrantId={publicRegId} />
      </Suspense>
    );
  }

  const isFading = timerDone && authResolved;

  if (visible) {
    return (
      <div
        style={{
          opacity: isFading ? 0 : 1,
          transition: 'opacity 0.45s ease',
          position: 'fixed', inset: 0, zIndex: 9999,
        }}
      >
        <SplashScreen />
      </div>
    );
  }

  if (status === 'unauthenticated') return <LoginPage />;
  if (status === 'denied' || status === 'pending') return <AccessDenied />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
