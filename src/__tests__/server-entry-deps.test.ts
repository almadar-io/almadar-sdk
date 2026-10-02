/**
 * The server and client entries never need @almadar/ui (only `./react` renders),
 * so @almadar/ui is an OPTIONAL peer: a server-side consumer (the desktop engine,
 * App Hosting) does not install ui's React/icon/mermaid tree (~400 MB) — G-CROSS-036.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('@almadar/ui is optional for non-React entries', () => {
  it('the server and client entries never import @almadar/ui', () => {
    const offenders = ['server', 'client']
      .flatMap((entry) => sources(path.join(root, 'src', entry)))
      .filter((file) => /from ['"]@almadar\/ui/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the manifest declares @almadar/ui as an optional peer, never a dependency', () => {
    expect(manifest.dependencies?.['@almadar/ui']).toBeUndefined();
    expect(manifest.peerDependencies?.['@almadar/ui']).toBeDefined();
    expect(manifest.peerDependenciesMeta?.['@almadar/ui']?.optional).toBe(true);
  });
});
