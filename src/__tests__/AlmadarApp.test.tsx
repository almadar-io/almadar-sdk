import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { OrbitalSchema } from '@almadar/core';
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

vi.mock('../react/OrbitalConfigPanel', () => ({
  OrbitalConfigPanel: function OrbitalConfigPanel() {
    return <div data-testid="controls-rail" />;
  },
}));

const TEST_SCHEMA: OrbitalSchema = {
  name: 'test-app',
  orbitals: [
    {
      name: 'MainOrbital',
      entity: { name: 'Item', fields: [{ name: 'id', type: 'string' }] },
      traits: [],
      pages: [{ name: 'HomePage', path: '/' }],
    },
  ],
};

describe('@almadar/sdk/react surface', () => {
  it('exports AlmadarApp as a component', () => {
    expect(AlmadarApp.displayName).toBe('AlmadarApp');
    expect(typeof AlmadarApp).toBe('function');
  });

  it('re-exports useOrbBus from @almadar/ui/hooks', () => {
    expect(typeof useOrbBus).toBe('function');
  });
});

describe('AlmadarApp showControls', () => {
  it('showControls={false} hides the rail even when exposedTiers is set', async () => {
    render(<AlmadarApp schema={TEST_SCHEMA} exposedTiers={['presentation']} showControls={false} />);
    await act(async () => {});
    expect(screen.queryByTestId('controls-rail')).toBeNull();
  });

  it('showControls={true} renders the rail even without exposedTiers', async () => {
    render(<AlmadarApp schema={TEST_SCHEMA} showControls={true} />);
    expect(await screen.findByTestId('controls-rail')).toBeTruthy();
  });

  it('omitted showControls falls back to legacy behavior: exposedTiers + non-server mode shows the rail', async () => {
    render(<AlmadarApp schema={TEST_SCHEMA} exposedTiers={['presentation']} />);
    expect(await screen.findByTestId('controls-rail')).toBeTruthy();
  });

  it('omitted showControls falls back to legacy behavior: no exposedTiers hides the rail', async () => {
    render(<AlmadarApp schema={TEST_SCHEMA} />);
    await act(async () => {});
    expect(screen.queryByTestId('controls-rail')).toBeNull();
  });
});
