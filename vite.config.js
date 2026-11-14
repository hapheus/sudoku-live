import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const isItch = mode === 'itch' || process.env.BUILD_TARGET === 'itch';
    return {
        base: isItch ? './' : '/',
        plugins: [react()],
        build: {
            outDir: isItch ? 'dist-itch' : 'dist',
            emptyOutDir: true,
        },
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: ['./tests/setup.js'],
            include: ['tests/**/*.test.{js,jsx}'],
            coverage: {
                provider: 'v8',
                include: ['src/**/*.{js,jsx}'],
                reporter: ['text', 'lcov', 'json-summary'],
                reportsDirectory: './coverage',
            },
        },
    };
});
