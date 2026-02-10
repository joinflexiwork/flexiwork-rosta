This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

**If you see "Unable to acquire lock at .next/dev.lock" or "Port 3000 is in use":**
- Run `npm run dev:clean` to remove the lock file and start the dev server.
- Or run `npm run dev:port` to start on port **3001** (then open http://localhost:3001).  
  Next.js does not auto-switch ports; use `dev:port` when 3000 is busy.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## FlexiWork Rosta – Invite Links & Mobile Access

### Supabase Auth URL (fix "null is unreachable" in emails)

If magic links or invite emails show **"null is unreachable"**, the Supabase **Site URL** is not set. Fix it in the dashboard.

#### Option A: Local testing (same WiFi – use your machine’s LAN IP)

1. **Supabase Dashboard:** https://supabase.com/dashboard → select your project.
2. **URL Configuration:** **Authentication** → **URL Configuration**
   - **Site URL:** `http://192.168.0.7:3000` (replace with your computer’s LAN IP if different).
   - **Redirect URLs:** add both:
     - `http://192.168.0.7:3000/**`
     - `http://localhost:3000/**`
   - Click **Save**.
3. **Magic Link template:** **Authentication** → **Email Templates** → **Magic Link**  
   Copy-paste the following (Supabase only offers variables like `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Email }}`).  
   **Subject:**
   ```
   Job Invitation - FlexiWork
   ```
   **Body:**
   ```
   Hi {{ .Email }},

   You've been invited to join a team on FlexiWork!

   To accept this invitation and create your account, click the link below:

   {{ .SiteURL }}/accept-invite?code={{ .TokenHash }}&type=team

   This link will expire in 48 hours.

   If you did not request this invitation, please ignore this email.

   Best regards,
   FlexiWork Team
   ```
   Click **Save**.  
   **Note:** Shift details (venue, time, manager) are not available in Supabase templates. When the user clicks the link they land on `/accept-invite` or (for shift invites) you can send them the rich link from the app: `/invite/[CODE]` shows full job details.
4. **Optional (faster testing):** **Authentication** → **Providers** → **Email** → turn OFF **Confirm email**.

**After this:** New invite/magic-link emails should contain `http://192.168.0.7:3000/...` instead of `null`. Use the same WiFi on your phone to open the link.

#### Custom invite emails (Resend – optional)

Team invites can use **Resend** for branded HTML emails (FlexiWork logo, organisation name, role, CTA button) instead of Supabase’s default template. Add to `.env.local`:

- `RESEND_API_KEY` – your Resend API key (e.g. from [resend.com](https://resend.com))
- `RESEND_FROM` – sender address, e.g. `FlexiWork Rosta <onboarding@yourdomain.com>`

If both are set, the invite API sends the custom email and does **not** call Supabase’s invite email. If either is missing, the API still creates the invite and returns `manualLink` so you can share the accept link manually. The accept link format is: `/accept-invite?code=XXX&type=team` (employees) or `...?code=XXX` (managers).

**Other environments:**
- **Site URL** can also be set to an ngrok URL (e.g. `https://xxxx.ngrok.io`) or your production URL (e.g. `https://yourapp.vercel.app`).
- **Redirect URLs:** add the same base + `/**` for each environment you use.

#### When using ngrok – update Supabase to match

If you use ngrok (e.g. `npx ngrok http 3000`), set **both**:

1. **`.env.local`:** `NEXT_PUBLIC_APP_URL=https://your-ngrok-url.ngrok-free.dev`
2. **Supabase Dashboard** (so magic links and redirects work):
   - Open: **Authentication** → **URL Configuration**  
     (direct: https://supabase.com/dashboard/project/ewudhvaunpsnevrgweor/auth/url-configuration)
   - **Site URL:** `https://shanda-unparticularizing-maude.ngrok-free.dev` (or your current ngrok URL)
   - **Redirect URLs:** add `https://shanda-unparticularizing-maude.ngrok-free.dev/**` (or your ngrok URL + `/**`)
   - **Save**

Then restart the Next.js dev server. Invite links and auth redirects will work from any network (4G, different WiFi). Test e.g.:  
`https://shanda-unparticularizing-maude.ngrok-free.dev/invite/[code]`

### Mobile access (invite links on phone)

Invite links use `NEXT_PUBLIC_APP_URL` from `.env.local`. For workers on mobile:

- **Option A – Same WiFi:** Use your computer's LAN IP, e.g. `NEXT_PUBLIC_APP_URL=http://192.168.0.7:3000`. Phone and computer must be on the same network.
- **Option B – ngrok (recommended for testing):**
  ```bash
  npx ngrok http 3000
  ```
  Copy the `https://xxxx.ngrok.io` URL, then in `.env.local`:
  ```env
  NEXT_PUBLIC_APP_URL=https://xxxx.ngrok.io
  ```
  Restart the dev server. Links then work from the phone on 4G/5G or any WiFi.
- **Option C – Deploy:** Deploy the Next.js app (e.g. Vercel) and set `NEXT_PUBLIC_APP_URL` to the deployed URL.

### Rich invite message (shift details)

When you **Invite** workers to a shift (Dashboard → Rota → Fill Shift → Invite), the app shows a **copyable message** with:

- Subject and full shift details (venue, address, date, time, role, manager)
- Per-worker block with their email, invite code, and landing page link (`/invite/[CODE]`)
- Instructions to accept (Expo Go, register, code/link) and 48-hour expiry

Copy and send that block (e.g. WhatsApp/SMS/email) to each worker. When they open the link, **`/invite/[CODE]`** shows the full job details (venue, shift, manager). For emails with rich content (SendGrid/SES), you’d need to disable Supabase’s built-in emails and send your own; for now the Magic Link gives a working link and the landing page gives the details.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
