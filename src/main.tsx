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

// Returning users skip the full splash — first visit gets brand impression, repeat visits feel instant
const isReturning = (() => { try { return !!sessionStorage.getItem('wf_visited'); } catch { return false; } })();
const MIN_SPLASH_MS = isReturning ? 400 : 1600;
try { sessionStorage.setItem('wf_visited', '1'); } catch { /* noop */ }

// ── Service Worker registration with auto-update ──────────────────────────────
// Snapshot BEFORE registration — if no controller yet, this is the first install.
// Only auto-reload when a NEW SW replaces an EXISTING one (version update).
// Without this guard, controllerchange fires on first install mid-splash → double splash.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register('/sw.js').then(reg => {
    // Already a new SW waiting — activate it now
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // New SW just installed while page is open
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          // New version ready — activate immediately
          newSW.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch(() => { /* SW registration failed silently */ });

  // Reload to pick up new assets — but ONLY if a previous SW was already active.
  // First-ever install: hadController=false → skip reload (app already has latest assets).
  // Version update: hadController=true → reload to flush old cached chunks.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !refreshing) { refreshing = true; window.location.reload(); }
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
