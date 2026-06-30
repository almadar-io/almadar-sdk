import { describe, expect, it, vi } from 'vitest';
import { AlmadarApp } from '../react/AlmadarApp';
import { useOrbBus } from '../react/useOrbBus';

vi.mock('@almadar/ui/runtime', () => ({
  OrbPreview: function OrbPreview() {
    return null;
  },
  BrowserPlayground: function BrowserPlayground() {
    return null;
  },
}));

vi.mock('@almadar/ui/hooks', () => ({
  useEventBus: function useEventBus() {
    return { emit: vi.fn(), on: vi.fn(), once: vi.fn(), hasListeners: vi.fn(), onAny: vi.fn() };
  },
}));

describe('@almadar/sdk/react surface', () => {
  it('exports AlmadarApp as a component', () => {
    expect(AlmadarApp.displayName).toBe('AlmadarApp');
    expect(typeof AlmadarApp).toBe('function');
  });

  it('re-exports useOrbBus from @almadar/ui/hooks', () => {
    expect(typeof useOrbBus).toBe('function');
  });
});
