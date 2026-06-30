'use client';

/**
 * `<AlmadarApp />` — renders an orbital schema in the customer's React tree.
 *
 * Thin facade over `@almadar/ui`'s `OrbPreview` (server-backed) and
 * `BrowserPlayground` (in-browser mock server). The `mode` prop picks the
 * runtime path:
 *   - `static`: pure OrbPreview with `mockData`
 *   - `mock`  : BrowserPlayground (in-browser server, faker-seeded)
 *   - `server`: OrbPreview with `serverUrl`
 *
 * Lazy-imports the heavy runtime bundle so the SDK is import-cheap in Next.js
 * server components; the actual render happens client-side under a Suspense
 * boundary. CSS is imported as a side-effect at module load.
 */

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { AlmadarAppProps } from '../types';
import type { OrbitalSchema } from '@almadar/core';
import { OrbitalConfigPanel } from './OrbitalConfigPanel';
// Required global styles. Customers who self-manage Tailwind can import from
// the (forthcoming) `@almadar/sdk/react/no-css` entry instead.
import '@almadar/ui/index.css';

const OrbPreviewLazy = lazy(async () => {
  const mod = await import('@almadar/ui/runtime');
  return { default: mod.OrbPreview };
});

const BrowserPlaygroundLazy = lazy(async () => {
  const mod = await import('@almadar/ui/runtime');
  return { default: mod.BrowserPlayground };
});

function parseSchema(schema: string | OrbitalSchema): OrbitalSchema {
  if (typeof schema === 'string') {
    return JSON.parse(schema) as OrbitalSchema;
  }
  return schema;
}

export function AlmadarApp(props: AlmadarAppProps) {
  const mode = props.mode ?? 'static';
  const parsedSchema = useMemo(() => parseSchema(props.schema), [props.schema]);
  const [controlledSchema, setControlledSchema] = useState<OrbitalSchema>(parsedSchema);

  // Reset controlled schema when the incoming schema changes.
  useEffect(() => {
    setControlledSchema(parsedSchema);
  }, [parsedSchema]);

  const effectiveSchema = props.exposedTiers && mode !== 'server' ? controlledSchema : parsedSchema;
  const showControls = props.exposedTiers && props.exposedTiers.length > 0 && mode !== 'server';

  const preview = mode === 'mock' ? (
    <BrowserPlaygroundLazy
      schema={effectiveSchema}
      mode="mock"
      initialPagePath={props.initialPagePath}
      height={props.height}
      className={props.className}
    />
  ) : (
    <OrbPreviewLazy
      schema={effectiveSchema}
      mockData={props.data}
      serverUrl={props.serverUrl}
      initialPagePath={props.initialPagePath}
      height={props.height}
      className={props.className}
    />
  );

  if (!showControls) {
    return (
      <Suspense fallback={null}>
        {preview}
      </Suspense>
    );
  }

  const isBottom = props.controlsPosition === 'bottom';

  return (
    <Suspense fallback={null}>
      <div
        className={`flex ${isBottom ? 'flex-col' : 'flex-row'} w-full h-full`}
        style={{ height: props.height }}
      >
        <div className="flex-1 min-w-0">
          {preview}
        </div>
        <OrbitalConfigPanel
          schema={parsedSchema}
          exposedTiers={props.exposedTiers}
          position={props.controlsPosition}
          onSchemaChange={setControlledSchema}
        />
      </div>
    </Suspense>
  );
}

AlmadarApp.displayName = 'AlmadarApp';
