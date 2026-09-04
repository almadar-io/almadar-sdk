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
const testingLibraryReactRoot = findBuilderModule('@testing-library/react');
const testingLibraryDomRoot = findBuilderModule('@testing-library/dom');

const alias: { find: string | RegExp; replacement: string | ((id: string) => string) }[] = [];
if (reactRoot) {
  alias.push({ find: 'react/jsx-dev-runtime', replacement: path.join(reactRoot, 'jsx-dev-runtime.js') });
  alias.push({ find: 'react/jsx-runtime', replacement: path.join(reactRoot, 'jsx-runtime.js') });
  alias.push({ find: /^react(\/.*)?$/, replacement: reactRoot });
  alias.push({ find: /^react-dom(\/.*)?$/, replacement: path.join(path.dirname(reactRoot), 'react-dom') });
}
if (uiRoot) {
  alias.push({ find: /^@almadar\/ui\/runtime$/, replacement: path.join(uiRoot, 'dist/runtime/index.js') });
  alias.push({ find: /^@almadar\/ui\/components$/, replacement: path.join(uiRoot, 'dist/components/index.js') });
  alias.push({ find: /^@almadar\/ui\/hooks$/, replacement: path.join(uiRoot, 'dist/hooks/index.js') });
  alias.push({ find: /^@almadar\/ui\/index\.css$/, replacement: path.join(uiRoot, 'index.css') });
}
if (runtimeRoot) {
  alias.push({ find: '@almadar/runtime', replacement: runtimeRoot });
}
if (testingLibraryReactRoot) {
  alias.push({ find: /^@testing-library\/react(\/.*)?$/, replacement: testingLibraryReactRoot });
}
if (testingLibraryDomRoot) {
  alias.push({ find: /^@testing-library\/dom(\/.*)?$/, replacement: testingLibraryDomRoot });
}

export default defineConfig({
  resolve: {
    alias: alias.length > 0 ? alias : undefined,
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    globals: true,
    environment: 'happy-dom',
    server: {
      // @almadar/ui's compiled ESM (dist/components/index.js) has a static
      // `import { ordered, lib } from 'emojilib'` (EmojiPicker, pulled in via
      // PropertyInspector). emojilib is CJS (`module.exports = { lib, ordered,
      // fitzpatrick_scale_modifiers }`); left external, Vitest loads it through
      // Node's native ESM/CJS interop, whose cjs-module-lexer static analysis
      // only recovers `lib` from that object literal and drops `ordered` —
      // "Named export 'ordered' not found". Inlining routes it through Vite's
      // own transform, which resolves CJS named exports by runtime property
      // enumeration instead, matching apps/builder/packages/client/vite.config.ts's
      // `server.deps.inline` handling of @almadar/ui's other CJS deps.
      deps: {
        inline: [/@almadar\/ui/, /packages\/almadar-ui/, /emojilib/],
      },
    },
  },
});
