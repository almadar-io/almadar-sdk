import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { OrbitalSchema } from '@almadar/core';
import { OrbitalConfigPanel } from '../react/OrbitalConfigPanel';

const TEST_SCHEMA: OrbitalSchema = {
  name: 'test-config-app',
  orbitals: [
    {
      name: 'MainOrbital',
      entity: { name: 'Item', fields: [{ name: 'id', type: 'string' }] },
      traits: [
        {
          name: 'RenderTrait',
          scope: 'instance',
          config: {
            title: {
              type: 'string',
              default: 'Hello',
              label: 'Title',
              tier: 'presentation',
            },
            mode: {
              type: 'string',
              default: 'coordinate-plane',
              values: ['coordinate-plane', 'function-plot'],
              label: 'Mode',
              tier: 'domain',
            },
            hidden: {
              type: 'string',
              default: 'secret',
              label: 'Hidden',
              tier: 'internal',
            },
          },
        },
      ],
      pages: [{ name: 'HomePage', path: '/' }],
    },
  ],
};

describe('OrbitalConfigPanel', () => {
  it('renders nothing when no trait declares config', () => {
    const { container } = render(
      <OrbitalConfigPanel
        schema={{ name: 'empty', orbitals: [{ name: 'O', entity: { name: 'E', fields: [] }, traits: [], pages: [] }] }}
        exposedTiers={['presentation']}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders only fields in exposed tiers', () => {
    render(<OrbitalConfigPanel schema={TEST_SCHEMA} exposedTiers={['presentation']} />);
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.queryByText('domain')).toBeNull();
    expect(screen.queryByText('internal')).toBeNull();
  });

  it('groups fields by tier and respects multiple tiers', () => {
    render(<OrbitalConfigPanel schema={TEST_SCHEMA} exposedTiers={['presentation', 'domain']} />);
    expect(screen.getByText('presentation')).toBeTruthy();
    expect(screen.getByText('domain')).toBeTruthy();
    expect(screen.queryByText('internal')).toBeNull();
  });

  it('emits a schema with updated default when a control changes', () => {
    const onChange = vi.fn();
    render(<OrbitalConfigPanel schema={TEST_SCHEMA} exposedTiers={['presentation']} onSchemaChange={onChange} />);

    const input = screen.getByDisplayValue('Hello');
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalled();
    const nextSchema = onChange.mock.calls.at(-1)![0] as OrbitalSchema;
    const trait = nextSchema.orbitals[0].traits[0] as { config?: Record<string, { default?: unknown }> };
    expect(trait.config?.title.default).toBe('World');
  });

  it('reset restores the original schema', () => {
    const onChange = vi.fn();
    render(<OrbitalConfigPanel schema={TEST_SCHEMA} exposedTiers={['presentation']} onSchemaChange={onChange} />);

    const input = screen.getByDisplayValue('Hello');
    fireEvent.change(input, { target: { value: 'World' } });
    fireEvent.blur(input);

    const resetButton = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetButton);

    const nextSchema = onChange.mock.calls.at(-1)![0] as OrbitalSchema;
    const trait = nextSchema.orbitals[0].traits[0] as { config?: Record<string, { default?: unknown }> };
    expect(trait.config?.title.default).toBe('Hello');
  });
});
