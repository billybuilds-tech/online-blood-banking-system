import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        // During development, /api calls are forwarded to the Express server.
        proxy: { '/api': 'http://localhost:5000' },
    },
});
