# OAuth in the native app — why the web flow does not survive the WebView

Every OAuth flow in this app was written for a browser tab, and a Capacitor
WebView is not one. Two assumptions break, and they break silently: the user
taps Connect, something happens, and nothing comes back.

## 1. There is no origin worth redirecting to

With `androidScheme: "https"` the app is served from **`https://localhost`**. So
every `redirect_uri` built from `window.location.origin` — and they all were —
is a URI no provider console has ever heard of.

For Google that is `Error 400: redirect_uri_mismatch`, which is the error the
Drive screen produced in the APK.

## 2. Google will not show its sign-in page inside a WebView

Even with the URI fixed. Google refuses embedded WebViews outright
(`disallowed_useragent`, "this app may not be secure"). That is policy, not
configuration, so no amount of console work makes
`window.location.href = accounts.google.com/…` work from inside the app.

The way out is to leave the app: a Custom Tab on Android, `SFSafariViewController`
on iOS — a real browser — and to come back through a deep link.
`nativeShell.authorize()` (`src/services/NativeShellService.ts`) is that round
trip, and plugins reach it through `ctx.shell`.

## 3. A native app is a different OAuth client

A **Web** client only accepts http(s) redirect URIs and carries a `client_secret`.
Neither fits an APK: there is no https origin, and there is nowhere to hide a
secret in a bundle anyone can unzip.

So the native app authenticates as its own client, and Google is explicit about
the shape of its redirect — the reverse of the client id:

```
123-abc.apps.googleusercontent.com   →   com.googleusercontent.apps.123-abc:/oauth2redirect
```

No secret comes with it. PKCE stands in, which this codebase already did for the
web flow.

Three places have to agree on that scheme, or the browser finishes the sign-in
and has nowhere to hand the code back to:

| Where                          | What                                                  |
| ------------------------------ | ----------------------------------------------------- |
| Google Cloud Console           | an **Android** OAuth client (package + SHA-1)         |
| `VITE_GOOGLE_NATIVE_CLIENT_ID` | the client id, injected at build time                 |
| `AndroidManifest.xml`          | an `intent-filter` on the reversed id (CI derives it) |

A build without the secret still installs and runs — the Drive screen says it
cannot sign in, instead of sending the user to a redirect_uri_mismatch.

### The signing key has to be stable first

Google ties an Android OAuth client to a signing fingerprint, so registering one
is only meaningful if the debug key survives between builds. It did not: the
cache pointed at `~/.android/debug.keystore`, and AGP follows `XDG_CONFIG_HOME`
and writes `~/.config/.android/debug.keystore`. Nothing was ever cached, every
build signed with a fresh random key — which is also why installing an update
over a previous APK failed with "App not installed".

Two consecutive builds produced two different fingerprints, which is how this
surfaced. The cache path is fixed and the key is saved under
`android-debug-keystore-v2`.

It is still a _cache_: GitHub evicts entries untouched for 7 days. If the
fingerprint ever changes again, that is why, and the durable answer is to keep
the keystore as a base64 repo secret rather than let CI generate it.

## 4. A popup is not a channel

Garmin does not use a redirect; it opens a popup and waits for a `postMessage`,
with a `BroadcastChannel` as backup. In the native shell Capacitor hands
`window.open` to the system browser, which has no `opener` to message through
and shares no BroadcastChannel with the WebView. The popup opens, the user signs
in, and the app waits forever.

Garmin does _not_ refuse WebViews the way Google does, so the redirect flow the
component already carries as its popup-blocked fallback is enough: on native
`connectToGarmin()` goes straight to `connectWithRedirect()`, which lands back
on `https://localhost/oauth/garmin/callback` — the app's own route, served by
Capacitor.

**That redirect URI has to be registered in the Garmin console**, and it has not
been verified on a device. If Garmin rejects `https://localhost`, the fallback is
the same shape as Google's: a custom scheme through `ctx.shell.authorize()`.

## What is done, and what is not

- Drive: implemented and unit-tested (`tests/unit/GDriveNativeAuth.spec.ts`,
  `tests/unit/NativeShellService.spec.ts`). Needs the Android OAuth client to
  exist before it can work on a phone.
- Garmin: one-line redirect on native, unverified. Needs the redirect URI in the
  Garmin console.
- iOS: `NativeShellService` is platform-agnostic, but the iOS build registers no
  URL scheme yet — that is a `CFBundleURLTypes` entry in the deploy workflow,
  and an iOS OAuth client alongside the Android one.
