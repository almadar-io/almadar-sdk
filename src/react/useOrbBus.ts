'use client';

/**
 * Thin re-export of `useEventBus()` from `@almadar/ui` under a name that
 * matches the SDK's vocabulary. Returns the canonical bus interface
 * (`{ emit, on, once, hasListeners, onAny }`) so callers don't need to
 * reach into `@almadar/ui` directly.
 */

export { useEventBus as useOrbBus } from '@almadar/ui/hooks';
