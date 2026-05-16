import { describe, expect, it } from 'vitest';
import { AlmadarApp } from '../react/AlmadarApp';
import { useOrbBus } from '../react/useOrbBus';

describe('@almadar/sdk/react surface', () => {
  it('exports AlmadarApp as a forwardRef component', () => {
    expect(AlmadarApp.displayName).toBe('AlmadarApp');
    // forwardRef wraps the render fn in an object with `$$typeof` — we just
    // assert the exported value is callable/non-null.
    expect(typeof AlmadarApp).toBe('object');
  });

  it('re-exports useOrbBus from @almadar/ui/hooks', () => {
    expect(typeof useOrbBus).toBe('function');
  });
});
