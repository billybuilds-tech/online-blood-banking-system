import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        port: Number(process.env.OBBS_WEB_PORT) || 5173,
        strictPort: true,
        // During development, /api calls are forwarded to the Express server.
        proxy: { '/api': `http://127.0.0.1:${Number(process.env.OBBS_API_PORT) || 5000}` },
    },
});
