# FlexiWork Mobile (Phase 1)

Worker app for FlexiWork Rosta. Connects to the **same Supabase backend** as the Next.js manager dashboard.

## Setup

1. **Install dependencies** (from this directory):
   ```bash
   npm install
   ```

2. **Environment**: Copy `.env.example` to `.env` and set:
   - `EXPO_PUBLIC_SUPABASE_URL` – same as Next.js `NEXT_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` – same as Next.js `NEXT_PUBLIC_SUPABASE_ANON_KEY`  
   After changing `.env`, restart Expo (`npx expo start --clear`) so env vars are picked up.

3. **Run**:
   ```bash
   npx expo start
   ```
   Then press `i` for iOS simulator or `a` for Android.

### If `expo start` fails with "fetch failed" (network/connectivity)

Expo CLI may try to validate dependencies online and fail. Try in order:

1. **Use cache (skip `--clear`)**  
   `npx expo start`

2. **Offline mode**  
   `npm run start:offline`  
   or: `npx expo start --offline`

3. **Skip dependency validation**  
   `npm run start:no-check`  
   (sets `EXPO_NO_DEPENDENCY_VALIDATION=1` so startup doesn’t require network.)

4. **Check env**  
   Ensure `mobile/.env` exists (copy from `.env.example`) and has valid `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

### Infinite loading / blank screen in Expo Go

If the app shows an infinite spinner after scanning the QR code, try in order:

1. **Same WiFi**  
   Phone and computer must be on the same WiFi. If the computer is on Ethernet, try WiFi. If they’re on different networks, use tunnel mode (below).

2. **Tunnel mode (works across any network)**  
   Stop the server (Ctrl+C), then:
   ```bash
   npx expo start --tunnel
   ```
   Or: `npm run start:tunnel`  
   This creates a public URL (ngrok) so the QR code works even on different WiFi or mobile data. Scan the new QR code.

3. **Wait for first bundle**  
   In the terminal, if it says "Bundling..." or shows a progress bar, wait 1–2 minutes (first build is slow on Windows). The spinner in Expo Go is normal during the first bundle.

4. **Check terminal logs**  
   Look for red errors under "Logs for your project will appear below". Common causes: missing `.env` (Supabase URL), import errors, TypeScript errors.

5. **Enter URL manually**  
   In Expo Go: **Enter URL manually** → e.g. `exp://YOUR_COMPUTER_IP:8081` (get your IP with `ipconfig` on Windows).

6. **Clear and restart with tunnel**  
   ```bash
   cd flexiwork-rosta/mobile
   npx expo start --clear --tunnel
   ```

**Recommended:** Use tunnel when phone and computer are on different networks: `npx expo start --tunnel` or `npm run start:tunnel`. If tunnel fails (e.g. ngrok timeout), use local network steps below.

### ngrok tunnel timeout / use local network instead

If you see **"ngrok tunnel took too long to connect"** (corporate firewall or network blocking ngrok), use **local network mode** with manual URL:

1. **Same WiFi**  
   Phone and computer must be on the **exact same WiFi** (not Ethernet-only on the computer if the phone is on WiFi).

2. **Get your computer’s IP**  
   In PowerShell or cmd:
   ```bash
   ipconfig
   ```
   Note the **IPv4 Address** under your WiFi adapter (e.g. `192.168.1.105` or `10.x.x.x`).

3. **Start Expo in standard (or LAN) mode**  
   ```bash
   npx expo start
   ```
   Or force LAN: `npx expo start --lan` or `npm run start:lan`.

4. **Enter URL manually in Expo Go**  
   - Open Expo Go → **Enter URL manually**  
   - Type: `exp://YOUR_IP:8081`  
   - Example: `exp://192.168.1.105:8081`

5. **If it still doesn’t connect – Windows Firewall**  
   Port 8081 may be blocked. In **PowerShell as Administrator**:
   ```powershell
   New-NetFirewallRule -DisplayName "Expo Metro" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
   ```

6. **Check for other errors**  
   In the terminal, look under "Logs for your project will appear below" for red errors (e.g. missing `.env`, import/TypeScript errors).

**Quick local-network flow:** Run `ipconfig` → note IPv4 (e.g. `192.168.1.xxx`) → run `npx expo start` → in Expo Go enter `exp://192.168.1.xxx:8081`.

## Features

- **Auth**: Login, Register (with optional invite code), Accept Invite (team or shift from deep link).
- **Invites tab**: Pending shift invites; Accept (uses RPC `accept_shift_invite_atomic`) / Decline; Realtime updates.
- **Shifts tab**: Upcoming shifts; Clock in/out with GPS (expo-location).
- **Profile tab**: Name, email, primary venue, roles; Logout.
- **Deep linking**: `flexiwork://invite?code=ABC123&type=team|shift` opens app and routes to accept-invite or register.

## Critical testing

1. **Race condition**: Two devices, same invite, both tap Accept – only one should succeed; other sees "Sorry, just taken!" (RPC is atomic).
2. **GPS**: Clock in outdoors for accurate coordinates.
3. **Offline**: No queue yet – show error if no internet.

## Database

Uses existing Supabase schema: `shift_invites`, `shift_allocations`, `rota_shifts`, `timekeeping_records`, RPC `accept_shift_invite_atomic`.
