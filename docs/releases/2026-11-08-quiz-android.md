# QWEEPS 0.2.0 Android and quiz update

Android package `org.qweeps.app` now uses version name **0.2.0** and version code
**2**. The APK retains the existing local debug signing identity for direct
installation over the earlier build. The minimum Android API remains 26.

## Quiz and appearance changes

- Fresh source-based quizzes cover all selected PDF, DOCX and PowerPoint material;
  generation does not silently reopen an older saved quiz.
- Ordered recall supports 2–5 numbered blanks and a shared bank of 8–10 choices.
  Each blank is graded independently, correct answers advance within the sentence,
  and placed answers darken and remain disabled.
- All Questions challenges add difficulty-weighted scores, streak combos and five
  hearts. Every five correct answers restore half a heart, up to five; wrong
  answers cost one heart. Zero hearts ends the run with retry/practice available.
- Adaptive recall brings weak answers back sooner, stretches clean recall toward
  ten other answers, and requires typed answers on later successful recurrences.
- Challenges save on the device. Quiz progress boxes and live mastery counters
  are removed. Four application themes are available in Settings → Appearance.

The Android build includes the updated React assets and Python quiz/document
modules. Provider keys and personal lesson libraries are not included in the APK.
The separate desktop architecture workspace still requires Node.js and is not
integrated into the standalone Android runtime.

## Build and verification

Run `npm run android:build`; the installer is exported to `dist/qweeps.apk`.
The version, packaged frontend/Python modules and APK signature were inspected,
and the signer matches the earlier local installer. Browser checks covered the
ordered interface in portrait and landscape. No Android device or emulator was
connected for a new device-level test in this update.

See [Android setup](../android.md) for installation, runtime and signing details.
