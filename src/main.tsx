import { StrictMode, useState, useEffect, useRef } from 'react';
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

// Returning users skip the full splash — first visit gets brand impression, repeat visits feel instant
const isReturning = (() => { try { return !!sessionStorage.getItem('wf_visited'); } catch { return false; } })();
const MIN_SPLASH_MS = isReturning ? 400 : 1600;
try { sessionStorage.setItem('wf_visited', '1'); } catch { /* noop */ }

// ── Service Worker registration with auto-update ──────────────────────────────
// When a new SW is waiting (new deploy), tell it to skip waiting and reload
// so returning users always get the latest app version instantly.
if ('serviceWorker' in navigator) {
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

  // When SW takes control (after skipWaiting), reload once to get fresh assets
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; window.location.reload(); }
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

  // When both gates pass → start fade-out
  useEffect(() => {
    if (timerDone && authResolved && visible) {
      // Give a tick for the fade class to apply, then unmount
      const t = setTimeout(() => setVisible(false), 450);
      return () => clearTimeout(t);
    }
  }, [timerDone, authResolved]);

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
