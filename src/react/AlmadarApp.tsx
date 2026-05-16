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

import { lazy, forwardRef, Suspense, useImperativeHandle, useRef } from 'react';
import type { EventPayload } from '@almadar/core';
import type { AlmadarAppProps, AlmadarAppRef } from '../types';
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

export const AlmadarApp = forwardRef<AlmadarAppRef, AlmadarAppProps>(function AlmadarApp(
  props,
  ref,
) {
  const emitterRef = useRef<((event: string, payload?: EventPayload) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    emit(event, payload) {
      if (emitterRef.current === null) return;
      emitterRef.current(event, payload);
    },
  }));

  const mode = props.mode ?? 'static';

  return (
    <Suspense fallback={null}>
      {mode === 'mock' ? (
        <BrowserPlaygroundLazy
          schema={props.schema}
          mode="mock"
          initialPagePath={props.initialPagePath}
          height={props.height}
          className={props.className}
        />
      ) : (
        <OrbPreviewLazy
          schema={props.schema}
          mockData={props.data}
          serverUrl={props.serverUrl}
          initialPagePath={props.initialPagePath}
          height={props.height}
          className={props.className}
        />
      )}
    </Suspense>
  );
});

AlmadarApp.displayName = 'AlmadarApp';
