# FormFit — Android-ready starter

A React + Vite prototype designed to run in Android Chrome and install as a PWA. It can also be wrapped as an Android app later with Capacitor.

## Features
- Upload a form as PDF, JPG, or PNG.
- Upload one portrait and reuse it in two photo boxes without removing its background.
- Upload a signature image and remove near-white pixels to make the signature background transparent.
- Automatically detect prominent red/yellow demo markings when possible.
- Draw or correct the target boxes manually on real, uncolored forms.
- Fit portraits without stretching; fit signatures at a deliberately smaller size.
- Export the completed first page as PDF or PNG.
- Image handling runs locally in the browser.

## Run it
Install Node.js LTS, extract this folder, open a terminal in the folder, then run:

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. To test on an Android phone on the same Wi-Fi, use the computer's LAN IP and Vite port, e.g. `http://192.168.1.5:5173`.

To build:
```bash
npm run build
```

## Install on Android
For a quick app-like experience, serve the built app over HTTPS and use Chrome → menu → **Install app** / **Add to Home screen**. For a native APK, add Capacitor and Android Studio after validating the workflow.

## Important prototype limitations
- This is a starter, not a production-grade automatic form-recognition system.
- Color detection is a heuristic. It may fail on scans, faded colors, or red boxes that touch each other. Always inspect and correct placements.
- For a real form without colored guides, use the manual box tools. A future template feature should save box coordinates relative to each form type so the user only marks a particular form once.
- PDF input currently renders only page 1 and exports a flattened one-page PDF. It does not preserve the source PDF's other pages, form fields, or selectable text.
- White-background removal is a simple brightness threshold and can remove pale signature strokes or leave shadows. Dark ink on a clean white background works best. A production app should use a proper foreground segmentation model.
- Exported files should be checked at 100% scale before official submission. Follow the form issuer's photo/signature requirements and use only images/signatures you are authorized to submit.

## Suggested next production steps
1. Add a saved template system (form fingerprint + normalized box coordinates).
2. Add multi-page PDF preservation and page selection.
3. Improve signature extraction with a segmentation model and edge cleanup.
4. Add resize/move controls and a zoomed placement editor.
5. Package with Capacitor and test on physical Android devices.


## Build an Android APK on Windows

1. Install **Node.js LTS** and **Android Studio** on your Windows computer. In Android Studio, install the Android SDK and platform tools when prompted.
2. Extract this ZIP and open PowerShell in the project folder.
3. Run these commands in order:

```powershell
npm install
npm install @capacitor/android@^6.2.0
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

4. Android Studio opens the Android project. Wait for Gradle sync to finish. Connect your phone with USB debugging enabled, or choose **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
5. For a debug APK, Android Studio usually places it at `android/app/build/outputs/apk/debug/app-debug.apk`. Transfer that APK to your phone and open it to install. Android may ask you to allow installing unknown apps for the app you used to open the APK. Only install APKs you built or trust.

If `npx cap add android` says the Android platform already exists, skip that command and run `npx cap sync android`.

## Build an APK without installing Android Studio (GitHub Actions)

This project includes `.github/workflows/build-apk.yml`. After uploading the project to a GitHub repository:

1. Open the repository on GitHub and choose **Actions**.
2. Select **Build FormFit Android APK**.
3. Press **Run workflow** and wait for the run to finish successfully.
4. Open that completed run and download the **FormFit-debug-apk** artifact.
5. Extract the downloaded artifact ZIP on your Android phone and tap `app-debug.apk` to install. Android may ask you to allow installs from that browser/file manager.

This is an unsigned debug APK intended for personal testing, not Play Store publishing. GitHub account and repository setup are required.
