# Realtime Location Tracker v1.1

Live location sharing + friends + 1:1 chat. Built with **Expo SDK 54**, **Supabase**, and **react-native-maps**.

## Features

- Email auth (login / signup) with success & error modals
- Live map with **avatar markers** for you and friends
- **Recenter** on your location + **fit all friends**
- Toggle location sharing on/off
- Discover users → send / accept friend requests
- Realtime 1:1 chat
- Minimalist consistent design (light & dark)

---

## Quick setup

### 1. Install

```bash
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → paste the full schema (see `SUPABASE_SCHEMA.sql` or the SQL block in previous messages)
3. Create `.env` in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

4. Restart with cache clear:

```bash
npx expo start -c
```

### 3. Test realtime location (important)

You need **two accounts** on two devices / emulators:

1. Device A: Sign up as `alice@test.com` → Map tab (sharing on)
2. Device B: Sign up as `bob@test.com` → Friends → Discover → add Alice → Accept on Alice’s side
3. Both open **Map** tab
4. Alice’s avatar should appear on Bob’s map (and vice versa) and move when either walks/drives
5. Tap the **locate** button (bottom-right) to re-center on yourself
6. Tap the **people** button to fit all friends in view

If markers don’t appear:
- Confirm friendship is **accepted**
- Confirm both have location permission
- Confirm the green “Sharing live” badge is on
- Check Supabase Table Editor → `locations` has rows

---

## Map controls

| Button | Action |
|--------|--------|
| Radio (green) | Toggle live sharing |
| People | Fit map to you + all friends |
| Locate | Re-center on your current GPS position |

---

## Project structure

```
app/
  (auth)/login.tsx, signup.tsx
  (app)/map.tsx, friends.tsx, chats.tsx, profile.tsx, chat/[id].tsx
components/
  AvatarMarker.tsx, ui/Button, Input, StatusModal
contexts/AuthContext.tsx
lib/supabase.ts
constants/theme.ts
```

---

## Notes

- Location is written to Supabase about every 5 seconds while sharing is on
- Realtime + 10s polling fallback keeps friend markers in sync
- Custom avatar markers redraw when coordinates change
- `react-native-maps` uses Apple Maps on iOS and Google Maps on Android (Expo Go works out of the box)

Enjoy!
