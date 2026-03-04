import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isGitHubPages = mode === 'github-pages' || process.env.GITHUB_PAGES === 'true';
  const repoNameFromCi = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const pagesBase =
    process.env.GITHUB_PAGES_BASE
    ?? (repoNameFromCi ? `/${repoNameFromCi}/` : '/');

  return {
    base: isGitHubPages ? pagesBase : '/',
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/three/')) {
              return 'three';
            }
            if (id.includes('/node_modules/')) {
              return 'vendor';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
  };
});
