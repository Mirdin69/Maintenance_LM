import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL('./src/' + p, import.meta.url));

// `npm run demo` remplace la connexion Supabase par une base en mémoire, pour essayer
// l'interface sans compte. Cette substitution n'existe jamais dans la version déployée.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      ...(mode === 'demo' ? [{ find: /^@\/lib\/api$/, replacement: src('lib/api.fake.ts') }] : []),
      { find: /^@\//, replacement: src('') },
    ],
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
}));
