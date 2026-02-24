import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isGitHubPages = mode === 'github-pages' || process.env.GITHUB_PAGES === 'true';

  return {
    base: isGitHubPages ? '/Lofi-race/' : '/',
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
