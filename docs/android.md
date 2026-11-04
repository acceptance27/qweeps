# QWEEPS Android

The Android app bundles the React studio and QWEEPS Python package in one APK.
A native Android WebView connects to a Chaquopy-hosted Python server at
`http://127.0.0.1:4174`. This keeps `/api/visual/...`, narration and media on the
same origin without a second JavaScript-to-Python bridge. Capacitor is not needed
for this wrapper.

## Interface

- The home screen has separate Create and Library tabs, with paged lesson cards.
- Lessons fill the remaining viewport. Captions overlay the stage with a transparent
  background. The object-instruction/context bar and page labels are removed.
- Mobile chapter selection uses a native select, and quiz controls expand on demand.
- Mobile multiple-choice questions show all four options at once: one column in
  portrait and two columns alongside the prompt in landscape. Tapping an answer
  submits it directly. Feedback replaces the choices until advancing.
- Scorecards use Summary and Concept review tabs, with paged concept results.
- Portrait and short landscape layouts use the available viewport, including safe
  insets. Settings and source input remain usable with the on-screen keyboard.

## Bundled runtime and supported work

The APK contains Python 3.11, the existing `assistant` modules, and `pypdf` for PDF
extraction. App data and API credentials stay in Android's app-private files
folder; Android backup is disabled. Provider keys are entered in Settings/APIs.
OpenCode Go uses the existing direct HTTPS client, so no OpenCode executable is
required. OpenRouter is also available through the existing Python client.

Desktop OpenGL/Manim renderers, the OpenCode CLI, LibreOffice and desktop speech
executables do not run inside Android. Browser/SVG lesson generation, playback,
question answering and quizzes use the bundled Python logic. Remote rendering
requires a separately configured renderer. Desktop-native lesson assets which
were never bundled with the APK cannot be reconstructed by the mobile app.

## Background execution

`PythonService` owns the Python server. Active generation uses a `dataSync`
foreground notification and a bounded partial wake lock. Idle work releases the
wake lock; an idle service stops once the Activity is unbound. The notification
can reopen QWEEPS. Android’s system task controls can stop the app. The service is not restarted automatically at boot.

A foreground service is not an execution guarantee. Android can stop the app,
users can stop it, and Android 15+ limits `dataSync` services to six background
hours per 24 hours. `onTimeout` stops the service and releases its wake lock.
Planning/direction checkpoints and uploaded documents remain on disk. Reopening
an interrupted job may require restarting generation from its saved lesson draft.
Browser-frame review still requires the WebView to be active; background Python
can prepare a candidate but does not bypass visual review.

References: [Chaquopy setup](https://chaquo.com/chaquopy/doc/current/android.html),
[Android foreground service limits](https://developer.android.com/develop/background-work/services/fgs/timeout).

## Build

Requirements: JDK 17 or 21, a licensed Android SDK with API 35 and build-tools
35.0.0, Node/npm, and a Python 3.11 build interpreter. Android Studio is optional.
Gradle 8.11.1 is pinned and verified by its distribution SHA-256. The current build
includes ARM64 phones and x86_64 emulators, with Android 8.0 (API 26) as the minimum.

For this configured checkout:

```bash
npm run android:build
```

The script detects the SDK from `android/local.properties`, selects the installed
JDK 21 when the shell's Java is incompatible, and finds Python 3.11 through `uv`.
Use `npm run android:check` to check these paths without building. Other machines
can supply explicit paths:

```bash
npm install
export QWEEPS_JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
export QWEEPS_BUILD_PYTHON=/path/to/python3.11
npm run android:build
```

During UI development, use `npm run dev` and the browser preview. Source changes
update the preview immediately. Rebuild and reinstall when those changes should
appear in the standalone app. Editing in-app settings or generating lessons does
not require a new APK. Install an updated APK over the existing app, with the same
package and signing key, to retain its app-private data.

The output is `android/app/build/outputs/apk/debug/app-debug.apk`. This is a
self-signed debug APK for device testing, not a Play Store release. Do not commit
SDK paths, provider credentials, signing keys, or generated build output. To
produce a release for distribution, configure a private release signing key and
run `:app:assembleRelease` with the matching signing configuration.

Device verification should cover launching without credentials, entering a key,
PDF selection, generation with the screen off, returning during frame review,
rotation during playback, narration pause/resume, quizzes, background timeout,
and user cancellation. An APK build and browser emulation do not establish those
real-device behaviors.

## Verified in this implementation

The debug APK was built with the pinned Gradle/Chaquopy setup and its APK signature
was checked. Android 15 x86_64 emulator instrumentation verified the bundled Python
server, same-origin studio assets, settings endpoint, `pypdf` import, and native
foreground-service startup. The related Python suite passed 88 tests; the frontend
suite passed 76 tests. Browser review covered 390×844 portrait and 844×390 landscape.
These checks do not replace testing a physical ARM64 phone or a real provider job
through screen lock, network loss and operating-system cancellation.
