'use client';

/**
 * Thin re-export of the host-plugin surface from `@almadar/ui` under the
 * SDK's vocabulary. A plugin is an ordinary `.orb` behavior; `OrbitalPluginHost`
 * runs it headless against the embedding app's own event bus and slots
 * (Almadar Studio V4 §14, Part F1/F1b) — see the README's "Host plugins"
 * section for a usage example.
 *
 * Unlike `AlmadarApp`, this is NOT behind a `React.lazy()` boundary: two of
 * the three exports (`useOrbitalPluginHost`, `useDeclaredCaptureTable`) are
 * hooks, which must be callable synchronously during render, so they cannot
 * sit behind a lazy/Suspense boundary the way `OrbPreview`/`BrowserPlayground`
 * are. Since a consumer of `OrbitalPluginHost` needs those hooks anyway, a
 * direct re-export is both correct and no heavier than what the consumer
 * would import in a lazy branch.
 */

export {
  OrbitalPluginHost,
  useOrbitalPluginHost,
  useDeclaredCaptureTable,
  assertUniqueSlotsPerHost,
} from '@almadar/ui/runtime';
export type {
  OrbitalPluginHostProps,
  PluginHostPlugin,
  PluginHostInbound,
  PluginHostDenyVerb,
  SlotHostRegion,
  SlotHostManifest,
} from '@almadar/ui/runtime';

export { useKeyboardRouter, mergeCaptureTables, keyChord } from '@almadar/ui/hooks';
export type { KeyCaptureTable, KeyCaptureEntry, EditorKeyEvent, UseKeyboardRouterOptions } from '@almadar/ui/hooks';

// UISlotComponent — the mount primitive a slot-host manifest's regions are
// declaring bindings FOR (`fallback`/`mode`, Studio V4 §14 Part I2). Comes
// from the package root, not `@almadar/ui/runtime`: it's a render
// substrate component, not part of the headless plugin-runtime surface.
export { UISlotComponent } from '@almadar/ui';
export type { UISlotComponentProps } from '@almadar/ui';
