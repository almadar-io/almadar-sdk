import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findBuilderModule(name: string): string | undefined {
  const candidate = path.resolve(__dirname, '../../apps/builder/node_modules', name);
  return existsSync(candidate) ? candidate : undefined;
}

const reactRoot = findBuilderModule('react');
const uiRoot = findBuilderModule('@almadar/ui');
const runtimeRoot = findBuilderModule('@almadar/runtime');

const alias: { find: string | RegExp; replacement: string }[] = [];
if (reactRoot) {
  alias.push({ find: 'react', replacement: reactRoot });
  alias.push({ find: 'react/jsx-dev-runtime', replacement: path.join(reactRoot, 'jsx-dev-runtime.js') });
  alias.push({ find: 'react/jsx-runtime', replacement: path.join(reactRoot, 'jsx-runtime.js') });
  alias.push({ find: 'react-dom', replacement: path.join(path.dirname(reactRoot), 'react-dom') });
}
if (uiRoot) {
  alias.push({ find: /^@almadar\/ui(\/.*)?$/, replacement: uiRoot });
}
if (runtimeRoot) {
  alias.push({ find: /^@almadar\/runtime(\/.*)?$/, replacement: runtimeRoot });
}

export default defineConfig({
  resolve: {
    alias: alias.length > 0 ? alias : undefined,
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    globals: true,
    environment: 'happy-dom',
  },
});
