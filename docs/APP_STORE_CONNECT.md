# Apple App Store Connect — Submission Documentation

Use this document when filling out App Store Connect fields for Tripti.

---

## App Information

| Field | Value |
|-------|-------|
| **App Name** | Tripti |
| **Subtitle** | Plan trips together |
| **Bundle ID** | ai.tripti.app |
| **SKU** | ai.tripti.app |
| **Primary Language** | English (U.S.) |
| **Primary Category** | Travel |
| **Secondary Category** | Social Networking |
| **Content Rights** | Does not contain third-party content |
| **Age Rating** | 4+ |

---

## Version Information

### Promotional Text (170 chars max — can be updated without a new release)

```
Plan group trips without the chaos. Suggest dates, build consensus, and lock plans — all through a simple chat-first experience your whole group can use.
```

### Description (4000 chars max)

```
Tripti makes group trip planning feel calm, clear, and collaborative — no more endless group chats, spreadsheets, or back-and-forth texts.

HOW IT WORKS

1. Create a trip and invite your circle
Start by naming your trip and sharing an invite link. Everyone joins a private circle — a trusted group just for your crew.

2. Suggest dates and build consensus
Each traveler proposes date windows in plain text ("March 7-9", "last weekend of April"). Others signal support, and overlap surfaces naturally. No rigid calendars or forced availability grids.

3. Lock dates and move forward
The trip leader proposes a window. Travelers react — Works, Maybe, or Can't. When enough people are on board, the leader locks the dates and the group moves on.

4. Plan the rest together
Once dates are locked, collaborate on itinerary ideas, accommodation options, packing and transport prep, and expenses — all from one chat-first command center.

KEY FEATURES

- Chat-first coordination: Decisions happen where conversation already lives. No separate planning tools to juggle.
- Date windows: Flexible date suggestions that surface overlap naturally, instead of rigid availability grids.
- Progressive scheduling: Move from idea to locked dates at your own pace. No pressure, no deadlines.
- Smart itineraries: AI-assisted itinerary generation based on your group's ideas and preferences.
- Circles: Private groups for your travel crew. Create one per friend group, or one per trip.
- Expense splitting: Track shared costs and see who owes what.
- Memory gallery: Share photos from the trip in one place.
- Prep tracking: Coordinate transport, packing, and logistics before you go.

DESIGNED FOR REAL GROUPS

Tripti is built for how friend groups actually work:
- Not everyone responds at the same time — and that's fine.
- One or two people usually drive the planning — Tripti supports that without making others feel left out.
- Availability doesn't mean commitment. Only locking dates represents a real decision.

No guilt. No nagging. Just a calmer way to plan together.

PRIVACY FIRST

Trip content is visible only to members of your circle. We do not sell personal data or show ads. Your group's plans stay between you.

Great for friend groups, families, and anyone who's tired of "so when are we going?" in the group chat.
```

### Keywords (100 chars max, comma-separated)

```
trip planning,group travel,travel planner,friends trip,itinerary,vacation planner,trip organizer
```

### What's New (Release Notes)

```
Welcome to Tripti! This is our first release.

- Create trips and invite your circle
- Suggest and vote on date windows
- Chat-first trip coordination
- AI-assisted itinerary generation
- Accommodation options and voting
- Expense tracking and splitting
- Memory gallery for trip photos
- Packing and transport prep tracking
- Sign in with Apple or Google
```

### Support URL

```
https://tripti.ai
```

### Marketing URL

```
https://tripti.ai
```

### Privacy Policy URL

```
https://tripti.ai/privacy
```

### Copyright

```
2026 Trypzy, Inc.
```

---

## App Privacy (Data Types)

Use these when answering the App Privacy questionnaire in App Store Connect.

### Does your app collect data? **Yes**

### Data Linked to You (associated with user identity)

| Data Type | Category | Purpose |
|-----------|----------|---------|
| Name | Contact Info | App Functionality |
| Email Address | Contact Info | App Functionality |
| User ID | Identifiers | App Functionality |
| Photos or Videos | User Content | App Functionality |

### Data Not Linked to You

| Data Type | Category | Purpose |
|-----------|----------|---------|
| Device ID | Identifiers | Analytics |
| Crash Data | Diagnostics | App Functionality |
| Performance Data | Diagnostics | App Functionality |

### Data collection details

| Question | Answer |
|----------|--------|
| Is data used for tracking? | **No** |
| Is data shared with third-party advertisers? | **No** |
| Is data sold to data brokers? | **No** |
| Are third-party SDKs used for analytics? | **No** (server-side only) |
| Does the app use health or fitness data? | **No** |
| Does the app use financial data? | **No** (expense amounts are user-entered, not linked to bank accounts) |

### Third-party services that process data

| Service | Data Processed | Purpose |
|---------|---------------|---------|
| Google Sign-In | Name, email | Authentication |
| Apple Sign In | Name, email | Authentication |
| OpenAI API | Trip ideas, preferences (no PII) | Itinerary generation |
| Vercel (hosting) | All app data in transit | Infrastructure |
| MongoDB Atlas | All persisted data | Database |

---

## App Review Information

### Demo Account

| Field | Value |
|-------|-------|
| Username | review.tripti.ai@gmail.com |
| Password | tripti-beta-2026 |

> **Note:** The app is beta-gated. When prompted for the beta phrase on the login screen, enter: **tripti-beta-2026**

### Review Notes

```
Tripti is a group trip planning app. Users create "circles" (private friend groups), then create trips within those circles. The core flow is:

1. Create a trip
2. Travelers suggest date windows
3. Leader proposes and locks dates
4. Group collaborates on itinerary, accommodation, prep, and expenses

To test the full flow:
1. On the login screen, enter the beta phrase: tripti-beta-2026
2. Sign in with Google using review.tripti.ai@gmail.com / tripti-beta-2026
3. You will see existing test trips and circles on the dashboard
4. Tap into any trip to see the chat-first command center
5. Use the bottom bar to access scheduling, travelers, expenses, and memories

The app requires an internet connection. All data is stored server-side.

Sign in with Apple and Google are both supported as authentication methods.
```

---

## Age Rating Questionnaire

| Question | Answer |
|----------|--------|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Simulated Gambling | None |
| Real Gambling | None |
| Sexual Content and Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Unrestricted Web Access | No |
| Contests | No |

**Result: Rated 4+**

---

## Encryption (Export Compliance)

| Question | Answer |
|----------|--------|
| Does your app use encryption? | **Yes** (standard HTTPS/TLS only) |
| Does your app qualify for any exemptions? | **Yes** — uses only standard OS-provided encryption (TLS for networking). No custom or proprietary cryptographic algorithms. |
| Is your app available in France? | Yes |
| `ITSAppUsesNonExemptEncryption` | `false` |

---

## Required Permissions (Info.plist Usage Descriptions)

| Permission | Usage String |
|------------|-------------|
| Camera (`NSCameraUsageDescription`) | Tripti needs camera access so you can take and share photos during your trip. |
| Photo Library (`NSPhotoLibraryUsageDescription`) | Tripti needs access to your photos so you can share trip memories with your group. |

---

## Screenshot Suggestions

Recommended screenshots to capture (6.7" iPhone required, 5.5" optional):

1. **Welcome screen** — "Plan trips together — without coordination chaos"
2. **Dashboard** — Circles and trip cards
3. **Trip command center** — Chat feed with progress strip at top
4. **Date windows** — Travelers suggesting and supporting date ranges
5. **Itinerary** — AI-generated itinerary view
6. **Expense splitting** — Balance summary
7. **Memory gallery** — Shared trip photos
8. **Prep tracking** — Packing and transport checklist
