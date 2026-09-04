# @almadar/sdk

Embed Almadar agent-generated orbital schemas in your React app, and call the agent from your server.

> Status: **alpha** (`0.1.0-alpha.0`). API may shift before `0.1.0`. See [`docs/Almadar_Studio_SDK.md`](https://github.com/almadar-io/kflow.ai.builder/blob/main/docs/Almadar_Studio_SDK.md) for the full design doc and gap list.

## Install

```bash
npm install @almadar/sdk @almadar/runtime @almadar/ui @almadar/core
```

Peers: React 18+, react-dom 18+.

## Render an orbital in your React app

```tsx
'use client';
import { AlmadarApp } from '@almadar/sdk/react';
import schema from './dashboard.orb.json';

export default function Embedded({ data }: { data: Record<string, unknown[]> }) {
  return <AlmadarApp schema={schema} mode="static" data={data} height="100%" />;
}
```

Three render modes:

| `mode` | Effects | Use case |
|---|---|---|
| `static` (default) | None — pure UI with the `data` you pass | Static dashboards, snapshots |
| `mock` | In-browser fake server, faker-seeded if no `data` | Demos, design previews |
| `server` | Real backend at `serverUrl` | Production with persist/fetch/call-service |

## Host plugins

`@almadar/sdk/react` also re-exports the host-plugin surface from `@almadar/ui/runtime`: a plugin is just an ordinary `.orb` behavior that `OrbitalPluginHost` runs headless against your app's own event bus and slots — nothing about it is a new kind of artifact or a sandboxed capability tier.

```tsx
'use client';
import { EventBusProvider } from '@almadar/ui/providers';
import { UISlotProvider } from '@almadar/ui/context';
import { UISlotComponent } from '@almadar/ui/components';
import { OrbitalPluginHost } from '@almadar/sdk/react';
import myPlugin from './my-plugin.orb.json';

export default function Host() {
  return (
    <EventBusProvider>
      <UISlotProvider>
        <OrbitalPluginHost
          plugins={[
            {
              id: 'my-plugin',
              schema: myPlugin,
              inbound: [{ busEvent: 'MY_EVENT', orbital: 'MyPluginOrbital', trait: 'MyTrait', trigger: 'MY_EVENT' }],
            },
          ]}
        />
        <UISlotComponent slot="sidebar" />
      </UISlotProvider>
    </EventBusProvider>
  );
}
```

Nothing is denied by default — the plugin gets the same behavior power any preview has (in-memory persist, mock services). `deny` (an opt-in list of verbs like `'persist'` or `'call-service'`) and `mode` (`'mock'` vs `'server'`) are host policy you set, not a built-in restriction. See `docs/Almadar_Studio_SDK.md` for the full design (Almadar Studio V4 §14).

## Call the agent from your server

```ts
import { AlmadarClient } from '@almadar/sdk/client';

const almadar = new AlmadarClient({ apiKey: process.env.ALMADAR_API_KEY! });

const { schema } = await almadar.generate({
  prompt: 'A finance dashboard with revenue, customers, and churn KPIs',
  endUserId: 'customer-X-user-42',
  onEvent: (event) => console.log(event.type, event),
});
```

`AlmadarClient.generate()` streams SSE events (`start`, `orbital_added`, `complete`, …) via `onEvent`. The returned `schema` is the final `OrbitalSchema` you pass to `<AlmadarApp />`.

There is no job-polling mode — `generate({ async: true })` throws `AsyncUnsupportedError` before any network call. For long-running generations, consume the stream via `onEvent` instead.

## Issuing API keys

Keys are issued from Studio (`/settings/sdk`) on the **Teams** plan. See `docs/Almadar_Studio_Subscriptions.md` for plan details. Server-side use only — never ship `sk_*` to a browser.

## License

BSL-1.1
