# GPS recorder (Capacitor) — what bites, and why

The recorder (`plugins/data-providers/RecorderProvider/`) is the only feature
that needs the phone to keep working while nobody is looking at it. That is
where its traps come from. Every item below shipped broken once; none of them
shows up on a desktop browser, and only the last two show up in a five-minute
test around the block.

## 1. The plugin has no JavaScript to import

`@capacitor-community/background-geolocation` ships native code and a
`definitions.d.ts`. There is no `main`, no `module`, no dist. So:

```ts
// Never resolves. Vite leaves the bare specifier verbatim in the bundle
// (that is what @vite-ignore means), and the WebView has no import map.
const mod = await import(/* @vite-ignore */ '@capacitor-community/background-geolocation')
```

The only way in is the bridge, by name — which is what the plugin's README says:

```ts
import { registerPlugin } from '@capacitor/core'
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')
```

`@capacitor/core` is a real dependency of the web app, so this costs the PWA
nothing: the provider is hidden there by `available()`.

## 2. Three pieces of platform config, none of them optional

| Where                      | What                                                                                                                   | What breaks without it                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ci/capacitor.config.json` | `android.useLegacyBridge: true`                                                                                        | Fixes stop ~5 min after the app is backgrounded                                                               |
| Android manifest           | `POST_NOTIFICATIONS`                                                                                                   | Android 13+ suppresses the foreground-service notification that keeps the service alive                       |
| iOS `Info.plist`           | `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: [location]` | iOS terminates the app when it asks for location; without the background mode the watcher dies at screen lock |

They live in `ci/capacitor.config.json` and the two deploy workflows.

## 3. A recording outlives the screen that starts it

The watcher id must not live in the setup component. When it did, leaving the
screen mid-run orphaned the native foreground service (nothing could stop it
again), coming back started a second watcher, and the dead component's callback
kept writing its stale session over the restored one. It lives in
`client/session.ts`, at module level, and the view is only a view.

The same reasoning one level up: a WebView reload loses the module too, so the
watcher id is persisted alongside the session and `restore()` stops the orphan
it finds.

## 4. Pausing is a fact about time, not a boolean

A single `pausedMs` counter that only grows on resume leaves the HUD clock
running through the whole pause. The session stores pause _intervals_, the last
of which may still be open, and both the live duration and every `sample.time`
are read off the same `movingSecondsAt()`. Otherwise the last sample sits past
the end of the activity and every graph over a paused run is skewed.

Crash recovery anchors its pause on the **last fix**, not on the moment the app
reopened: the hours the app was dead were not moving time.

## 5. GPS lies in three different ways

- a poor accuracy figure (routine for the first fixes after a cold start),
- a teleport (tunnel exit, cell-tower fallback),
- the wander of a phone standing at a red light.

All three inflate the distance the user is shown. `acceptPoint()` refuses them;
`totalAscent()` needs the same hysteresis, or a flat 10 km comes back with a few
hundred metres of climb. When a fix is refused for accuracy the screen says so —
a mute "waiting for GPS" over a frozen distance is the moment the user decides
the recorder is broken.

## 6. `location.speed` is not the speed of the activity

The first real recording came back with a correct average pace next to a pace
graph that was nonsense — and the same graph is right for a Garmin activity, on
the same screen. Nothing was wrong with the graph.

The two numbers simply came from unrelated quantities. The summary divides
distance by duration. `SpeedSampled` plots `SegmentSample.speed`, which
`computeAverageSample` builds as the arithmetic mean of `sample.speed`. Garmin's
adapter fills that field with `speedMetersPerSecond`, the watch's own smoothed
1 Hz figure. The recorder filled it with the Capacitor plugin's raw
per-fix Doppler estimate: one instant, sometimes absent entirely, and tied to
nothing the activity is summarised from.

`speedSeries()` measures it on the track instead, over a 30 m window, in moving
**milliseconds**. Both halves matter:

- fixes arrive roughly every 5 m — under two seconds of running — and
  `sample.time` is stored in whole seconds, so a speed taken between neighbours
  divides a small distance by a heavily quantised time;
- a pause between two fixes would otherwise read as a dead stop.

The graph and the summary now come from the same distances and the same clock,
so they agree by construction. `maxSpeed` comes from the measured series too: a
single Doppler spike used to be enough to file a run with an impossible top
speed.

## Still open

- The HUD formats km and pace by hand. When this branch meets `ctx.units`
  (`docs/SPORT_AND_UNITS.md` on `main`), those three spots go through
  `ctx.units.format()` — a reader on imperial units currently gets km.
- Nothing here is covered on-device by CI. The unit tests
  (`tests/unit/plugins/Recorder*.spec.ts`) pin the maths and the wiring; the
  battery and background behaviour still need a real phone and a real run.
