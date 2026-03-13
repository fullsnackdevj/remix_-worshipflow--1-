import { StrictMode, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './themes/one-monokai.css';
import { ThemeProvider } from './ThemeContext.tsx';
import { AuthProvider, useAuth } from './AuthContext.tsx';
import LoginPage from './LoginPage.tsx';
import AccessDenied from './AccessDenied.tsx';
import SplashScreen from './SplashScreen.tsx';

const MIN_SPLASH_MS = 2000; // 2 seconds — enough for brand impression without feeling slow


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
