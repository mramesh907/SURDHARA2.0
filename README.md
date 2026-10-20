# SURDHARA

Music discovery + streaming app (React, Vite, Supabase). v2.1 adds scalable sync, offline resilience and PWA features; v2.3 adds YouTube → M4A downloads.

## Run
```bash
npm install
cp .env.example .env   # fill in your Supabase URL + publishable key
npm run dev            # http://localhost:5173
npm test               # unit tests (Node 20+)
npm run build && npm run preview
```
Run the SQL in `supabase/` in order: phase1 → phase2 → phase3 → **phase4-scale-and-offline.sql**.
Deploy at the site ROOT (the service worker assumes `/`). Service worker is active in production builds only.

## v2.3 — YouTube Downloads (paste a link → M4A in Downloads/Surdhara)
A new **YouTube Downloads** section (sidebar) lets anyone paste a YouTube video link. The audio is saved as an **.m4a** file in
`<your Downloads folder>/Surdhara`, and every song inside that folder is listed in the section and plays in SURDHARA.
Songs you copy into that folder yourself (m4a, mp3, aac, ogg, opus, wav, flac) show up too.

This needs the small companion server `app.py` running **on the same computer** (a website cannot write to your Downloads folder by itself).

```bash
pip install -r requirements.txt     # flask + yt-dlp (install ffmpeg too — recommended)
python app.py                       # http://localhost:5000
npm run dev                         # the website, http://localhost:5173  (finds the server on its own)
```
Or run `npm run build` once and open **http://localhost:5000** — `app.py` then serves the whole website too.

**Dedicated download endpoint** — give it a link, it saves an .m4a:
```
GET  http://localhost:5000/download/m4a?url=https://www.youtube.com/watch?v=VIDEO_ID          -> JSON (waits until saved)
GET  http://localhost:5000/download/m4a?url=...&file=1                                         -> also sends the .m4a file
POST http://localhost:5000/api/surdhara/download  {"url": "..."}   -> {job}; poll GET /api/surdhara/jobs/<id> (what the website uses)
GET  /api/surdhara/songs            list of songs in Downloads/Surdhara
GET  /api/surdhara/stream/<file>    audio stream (supports seeking)
DELETE /api/surdhara/songs/<file>   delete a song
GET  /api/surdhara/health           server / yt-dlp / ffmpeg status
```
Settings (environment variables, all optional): `SURDHARA_DIR` (folder), `SURDHARA_PORT`, `SURDHARA_HOST`,
`SURDHARA_ALLOWED_ORIGINS` (e.g. `https://your-site.vercel.app` if the website is hosted online but the server runs on your PC),
`SURDHARA_COOKIES_FROM_BROWSER=chrome` (fixes YouTube's "confirm you're not a bot" message). In the website, `VITE_DOWNLOADER_URL`
changes where the server is looked for (default `http://127.0.0.1:5000`).

Good to know
- The server only listens on your own computer (`127.0.0.1`) and only accepts requests from localhost or the origins you list.
- If a download fails with a YouTube error, update the downloader: `pip install -U yt-dlp`.
- Playlist links, live streams and private videos are refused with a clear message. A link that is already downloaded is not downloaded twice.
- Songs in this section are personal to your computer; they are not uploaded to the shared catalogue.
- `python -m unittest discover -s tests` runs the server tests (no internet needed).
- Only download audio you have the right to keep (see the licensing note below).

## v2.2 — mobile layout + background play
- `src/styles.css` (last block): one-row header, 44px touch targets, no text under 11px, safe-area aware mini player/nav,
  bottom-sheet modals, scrollable filter chips, landscape-phone layout. Verified with no horizontal scroll at 320–768px.
- **Background play** (`src/lib/useBackgroundPlayback.js`, switch in the expanded player, saved in localStorage):
  * Self-hosted songs use a real `<audio>` element and keep playing with the screen off / app switched.
  * YouTube songs play in an iframe, which phones tend to suspend. While one plays, a silent looping `<audio>` keeps the
    audio session alive, and if the browser still pauses it when the page is hidden (not a user pause) it is resumed.
  * Lock-screen / headset controls come from `useMediaSession.js`. Installed PWA + Android Chrome work best;
    iOS Safari may still pause YouTube iframes — only self-hosted audio is reliable there (see licensing note below).

## How it scales
- Catalogue is paged (Supabase caps responses at 1,000 rows), cached in IndexedDB, and delta-synced
  (`updated_at >= cursor`). A HEAD count detects removals; realtime events patch single rows.
- Lists render ~60 rows at a time; search uses a cached per-song index.
- Next step past ~20k songs: server-side search (pg_trgm index is in phase 4) instead of client search.

## Offline & failure behaviour
- App shell + hashed assets cached by `public/sw.js`; opens with no network.
- Songs hosted in Supabase Storage can be saved for offline (Cache API). YouTube songs cannot (YouTube terms).
- Connection loss mid-song: position remembered, resumes automatically; explicit pause is respected.
- Dead/removed videos are skipped (max 4 in a row) and flagged for 7 days.
- Library edits are mirrored locally and synced with backoff; unsynced edits survive closed tabs.

## Before you sell (read this)
1. **Licensing:** YouTube's terms generally forbid hiding the video to play audio only and forbid caching/downloading.
   Commercial use needs licensed/original audio you host, or a licensed catalogue API. Get legal advice.
2. Add Terms of Service, Privacy Policy, and a takedown contact. 3. Turn the CSP in `public/_headers` from
   Report-Only to enforced after checking reports. 4. Add error reporting via `window.__SURDHARA_REPORT_ERROR__`.
5. Rotate any keys that were ever shared; only the publishable key belongs in the browser.
