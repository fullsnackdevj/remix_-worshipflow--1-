import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const isProd = mode === 'production';
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      target: 'es2020',           // modern target = smaller output, better tree-shaking
      cssCodeSplit: true,         // split CSS per-chunk so lazy views only load their styles
      chunkSizeWarningLimit: 600, // warn if any chunk exceeds 600KB
      sourcemap: false,           // no sourcemaps in prod (faster build, smaller deploy)
      // ── Strip all console.* and debugger statements from production bundle ──
      // This removes console.warn/error/log without needing babel or source edits.
      esbuild: isProd ? {
        drop: ['console', 'debugger'],
        legalComments: 'none',    // strip license comments to save bytes
      } : {},
      rollupOptions: {
        output: {
          // Preload module tags for faster chunk loading
          experimentalMinChunkSize: 10_000, // avoid tiny useless chunks
          manualChunks: {
            // Firebase is large — split into its own cached chunk
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            // React core — rarely changes between deploys
            react: ['react', 'react-dom'],
            // Icon library — large but stable
            lucide: ['lucide-react'],
          },
        },
      },
    },
  };
});

