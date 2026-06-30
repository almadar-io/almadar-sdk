'use client';

/**
 * OrbitalConfigPanel — auto-derived control rail for an orbital schema.
 *
 * Finds the first trait that declares a non-empty `config`, filters its fields
 * by the consumer-supplied `exposedTiers`, and renders `@almadar/ui`'s
 * `PropertyInspector`. Every control change deep-clones the schema, writes the
 * new value into the matching field's `default`, and emits the mutated schema
 * so the host can pass it to `OrbPreview`.
 */

import React, { useMemo, useState } from 'react';
import type {
  ConfigFieldDeclaration,
  DeclaredTraitConfig,
  OrbitalSchema,
  Trait,
  TraitConfigValue,
} from '@almadar/core';
import { PropertyInspector } from '@almadar/ui/components';
import { Stack, Box, Typography } from '@almadar/ui/components';

interface ConfigTraitTarget {
  name: string;
  config: DeclaredTraitConfig;
}

function parseSchema(schema: string | OrbitalSchema): OrbitalSchema {
  if (typeof schema === 'string') {
    return JSON.parse(schema) as OrbitalSchema;
  }
  return schema;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findConfigTrait(schema: OrbitalSchema | null): ConfigTraitTarget | null {
  if (!schema?.orbitals) return null;
  for (const orbital of schema.orbitals) {
    for (const traitRef of orbital.traits ?? []) {
      if (typeof traitRef !== 'object' || traitRef === null) continue;
      const trait = traitRef as Trait | { ref?: string; config?: DeclaredTraitConfig };
      if (trait.config && Object.keys(trait.config).length > 0) {
        const name = 'name' in trait && typeof trait.name === 'string' ? trait.name : 'Config';
        return { name, config: trait.config };
      }
    }
  }
  return null;
}

function applyConfigOverride(
  schema: OrbitalSchema,
  field: string,
  value: TraitConfigValue,
): OrbitalSchema {
  const next = deepClone(schema);
  for (const orbital of next.orbitals ?? []) {
    for (const traitRef of orbital.traits ?? []) {
      if (typeof traitRef !== 'object' || traitRef === null) continue;
      const trait = traitRef as { config?: Record<string, ConfigFieldDeclaration> };
      if (trait.config && field in trait.config) {
        trait.config[field] = { ...trait.config[field], default: value };
        return next;
      }
    }
  }
  return next;
}

export interface OrbitalConfigPanelProps {
  schema: string | OrbitalSchema;
  exposedTiers?: string[];
  position?: 'right' | 'bottom';
  onSchemaChange?: (schema: OrbitalSchema) => void;
}

export function OrbitalConfigPanel({
  schema,
  exposedTiers,
  position = 'right',
  onSchemaChange,
}: OrbitalConfigPanelProps): React.ReactElement | null {
  const parsed = useMemo(() => parseSchema(schema), [schema]);
  const target = useMemo(() => findConfigTrait(parsed), [parsed]);
  const [values, setValues] = useState<Record<string, TraitConfigValue>>({});

  if (!target) return null;

  const sortedConfig: DeclaredTraitConfig = Object.fromEntries(
    Object.entries(target.config).sort(([a], [b]) => a.localeCompare(b)),
  );

  const handleChange = (field: string, value: TraitConfigValue): void => {
    setValues((prev) => ({ ...prev, [field]: value }));
    const nextSchema = applyConfigOverride(parsed, field, value);
    onSchemaChange?.(nextSchema);
  };

  const handleReset = (): void => {
    setValues({});
    onSchemaChange?.(parsed);
  };

  const isHorizontal = position === 'bottom';

  return (
    <Box
      className={`${
        isHorizontal ? 'w-full border-t' : 'h-full w-80 flex-shrink-0 border-l'
      } border-border bg-card p-3 overflow-y-auto`}
    >
      <Stack direction="vertical" gap="sm">
        <Typography variant="caption" weight="bold" color="muted">
          Controls
        </Typography>
        <PropertyInspector
          title={target.name}
          config={sortedConfig}
          values={values}
          onChange={handleChange}
          onReset={handleReset}
          tiers={exposedTiers}
        />
      </Stack>
    </Box>
  );
}

OrbitalConfigPanel.displayName = 'OrbitalConfigPanel';
