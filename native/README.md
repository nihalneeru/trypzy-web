# Tripti Native App (Capacitor)

iOS and Android wrapper for Tripti using Capacitor in **hosted URL mode**.
The native shell loads `https://tripti.ai` in a WebView and adds:
- Native Google Sign-In (system dialog, not WebView OAuth)
- Deep link handling (`https://tripti.ai/*` and `tripti://`)
- App Store / Play Store distribution
- Splash screen

**No PWA service worker is used.** All content is served live from the hosted URL.

---

## Architecture

```
Native App Start
    │
    ├─ Has Preferences("tripti_token")?
    │     YES → /native-bridge (sync to localStorage → /dashboard)
    │     NO  → /native-login  (Google Sign-In → token exchange → /native-bridge)
    │
    └─ Deep Link received:
          ├─ Authenticated → navigate WebView to path
          └─ Not auth → save pending_url → /native-login → after auth → pending_url
```

**Token flow:**
1. Native Google Sign-In returns Google ID token
2. POST to `https://tripti.ai/api/mobile/auth/google`
3. Backend verifies ID token, returns Tripti JWT
4. JWT stored in Capacitor `Preferences` (native secure storage)
5. `/native-bridge` page copies token from Preferences → `localStorage`
6. All API calls use `localStorage.tripti_token` via `Authorization: Bearer <token>`

---

## Setup

### Prerequisites
- Node.js 18+
- Xcode 15+ (iOS)
- Android Studio (Android)
- CocoaPods (`sudo gem install cocoapods`)

### Install dependencies

```bash
# From /native directory
cd native
npm install
```

### Google OAuth Client Setup

You need **three** Google OAuth client IDs from Google Cloud Console:

1. **Web Client ID** (already exists for web app)
   - Set in `capacitor.config.ts` → `plugins.GoogleAuth.serverClientId`
   - This is the `audience` used to verify ID tokens server-side

2. **iOS Client ID**
   - Create in Google Cloud Console → Credentials → OAuth 2.0 Client IDs
   - Type: iOS
   - Bundle ID: `ai.tripti.app`
   - Add reversed client ID to `ios/App/App/Info.plist` as a URL scheme:
     ```xml
     <key>CFBundleURLTypes</key>
     <array>
       <dict>
         <key>CFBundleURLSchemes</key>
         <array>
           <string>com.googleusercontent.apps.YOUR_IOS_CLIENT_ID</string>
         </array>
       </dict>
     </array>
     ```

3. **Android Client ID**
   - Create in Google Cloud Console → Credentials → OAuth 2.0 Client IDs
   - Type: Android
   - Package name: `ai.tripti.app`
   - SHA-1 fingerprint from your signing key:
     ```bash
     keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
     ```
   - Download `google-services.json` and place in `android/app/`

### Environment Variables (backend)

Ensure these are set on the Vercel deployment:
```
GOOGLE_CLIENT_ID=your-web-client-id
JWT_SECRET=your-jwt-secret
```

### Sync and Open

```bash
# Sync web assets and native plugins
npm run cap:sync

# Open in Xcode
npm run cap:open:ios

# Open in Android Studio
npm run cap:open:android
```

---

## Universal / App Links

### iOS (Associated Domains)

1. In Xcode → Signing & Capabilities → Add "Associated Domains"
2. Add: `applinks:tripti.ai`
3. Replace `TEAMID` in `public/.well-known/apple-app-site-association` with your actual Apple Team ID

### Android (App Links)

1. Replace the placeholder SHA-256 fingerprint in `public/.well-known/assetlinks.json`
   with your actual signing certificate fingerprint:
   ```bash
   keytool -list -v -keystore your-keystore.jks | grep SHA256
   ```
2. Verify after deployment:
   ```bash
   curl https://tripti.ai/.well-known/assetlinks.json
   ```

### Custom URL Scheme (fallback)

Both platforms also support `tripti://` as a fallback deep link scheme.
- iOS: Configured via `ios.scheme: 'tripti'` in `capacitor.config.ts`
- Android: Add intent filter in `android/app/src/main/AndroidManifest.xml`

---

## Testing

### Auth Flow

1. **Cold start, no token** → should see `/native-login` with "Continue with Google"
2. **Google sign-in** → native dialog → token exchange → redirect to `/dashboard`
3. **Kill app, relaunch** → auto-login via Preferences → `/native-bridge` → `/dashboard`
4. **Logout** → clears both `Preferences` and `localStorage`

### Deep Links

Test with:
```bash
# iOS Simulator
xcrun simctl openurl booted "https://tripti.ai/trips/test-trip-id"
xcrun simctl openurl booted "tripti://trips/test-trip-id"

# Android Emulator
adb shell am start -a android.intent.action.VIEW -d "https://tripti.ai/trips/test-trip-id"
adb shell am start -a android.intent.action.VIEW -d "tripti://trips/test-trip-id"
```

5. **Deep link while logged out** → saves URL → shows login → after auth → routes to saved URL
6. **Deep link while logged in** → immediate routing

### Verify Auth Header

Open browser DevTools (Safari → Develop → Simulator) and verify:
- `Authorization: Bearer <token>` header on API requests
- Token comes from `localStorage.tripti_token`

---

## Build for Distribution

### iOS
1. Open Xcode via `npm run cap:open:ios`
2. Set signing team and provisioning profile
3. Archive → Distribute to App Store Connect

### Android
1. Open Android Studio via `npm run cap:open:android`
2. Build → Generate Signed Bundle (AAB)
3. Upload to Google Play Console

---

## File Structure

```
native/
├── package.json            # Native shell dependencies + scripts
├── capacitor.config.ts     # Capacitor configuration (hosted URL mode)
├── www/
│   └── index.html          # Minimal fallback (WebView loads hosted URL)
├── src/
│   ├── index.js            # App bootstrap + deep link setup
│   └── auth.js             # Native Google Sign-In + token exchange
└── README.md               # This file

Web (in parent repo):
├── app/
│   ├── api/mobile/auth/google/route.js  # Token exchange endpoint
│   ├── native-login/page.jsx            # Native login UI
│   └── native-bridge/page.jsx           # Preferences → localStorage bridge
└── public/.well-known/
    ├── apple-app-site-association        # iOS Universal Links
    └── assetlinks.json                   # Android App Links
```
