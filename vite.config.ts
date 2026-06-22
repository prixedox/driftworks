import { defineConfig } from 'vite';

// Single-codebase build: served as a PWA on the web and wrapped by Capacitor
// for iOS/Android later. `base: './'` keeps asset paths relative so the same
// build works from a sub-path or inside a native WebView.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  worker: {
    // The simulation runs in a module Web Worker.
    format: 'es',
  },
});
