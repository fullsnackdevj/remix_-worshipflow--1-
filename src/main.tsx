import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider, useAuth } from './AuthContext.tsx';
import LoginPage from './LoginPage.tsx';
import AccessDenied from './AccessDenied.tsx';

function Root() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/icon-192x192.png" alt="WorshipFlow" className="w-16 h-16 rounded-2xl animate-pulse" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') return <LoginPage />;
  if (status === 'denied') return <AccessDenied />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
);
