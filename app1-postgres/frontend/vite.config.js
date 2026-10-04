import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev only: forward /api to the backend running on your machine.
    // In Docker, nginx does this job (see nginx.conf).
    proxy: { '/api': 'http://localhost:3000' },
  },
});
