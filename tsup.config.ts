import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/client/index.ts',
    'src/react/index.ts',
    'src/server/index.ts',
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: [
    'react',
    'react-dom',
    '@almadar/core',
    '@almadar/runtime',
    '@almadar/ui',
    'express',
  ],
});
