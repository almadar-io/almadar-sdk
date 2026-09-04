import { describe, expect, it, vi } from 'vitest';

// `@almadar/ui/runtime` and `@almadar/ui/hooks` pull in the full component
// tree (same reason `AlmadarApp.test.tsx` mocks them) — this file only needs
// to prove `../react/plugins` re-exports the right names under the right
// identities, not exercise the real implementations.
vi.mock('@almadar/ui/runtime', () => ({
  OrbitalPluginHost: function OrbitalPluginHost() {
    return null;
  },
  useOrbitalPluginHost: function useOrbitalPluginHost() {
    return { getState: vi.fn(), lastEvent: vi.fn(), errors: {} };
  },
  useDeclaredCaptureTable: function useDeclaredCaptureTable() {
    return {};
  },
}));

vi.mock('@almadar/ui/hooks', () => ({
  useKeyboardRouter: function useKeyboardRouter() {
    return undefined;
  },
}));

import {
  OrbitalPluginHost,
  useOrbitalPluginHost,
  useDeclaredCaptureTable,
  useKeyboardRouter,
} from '../react/plugins';

describe('@almadar/sdk/react plugin re-exports', () => {
  it('re-exports OrbitalPluginHost from @almadar/ui/runtime', () => {
    expect(typeof OrbitalPluginHost).toBe('function');
  });

  it('re-exports useOrbitalPluginHost from @almadar/ui/runtime', () => {
    expect(typeof useOrbitalPluginHost).toBe('function');
  });

  it('re-exports useDeclaredCaptureTable from @almadar/ui/runtime', () => {
    expect(typeof useDeclaredCaptureTable).toBe('function');
  });

  it('re-exports useKeyboardRouter from @almadar/ui/hooks', () => {
    expect(typeof useKeyboardRouter).toBe('function');
  });
});
