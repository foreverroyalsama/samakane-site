# Sama Kane — Deployment Guide

Going live on **samakane.com** in about 30 minutes.

**Total cost:** ~$10/year (just the domain — everything else is free forever)

---

## Overview of the workflow

After setup, here's what your day-to-day publishing looks like:

1. **Drop new photos** into the `pics/` folder on your computer
2. **Drop new videos** into the `videos/` folder
3. **Edit two small JSON files** (`pics-manifest.json` and `videos-manifest.json`) to list them
4. **Run one command** (`git push`) — or click "Sync" in GitHub Desktop
5. **Wait ~30 seconds** → your site updates worldwide

That's it. No servers to manage, no logins to maintain, no bills.

---

## Part 1 — Register samakane.com on Cloudflare (10 min)

### 1.1 Create a Cloudflare account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up with your email (free)
3. Verify your email address

### 1.2 Buy the domain

1. In the Cloudflare dashboard, click **"Domain Registration"** in the left sidebar
2. Search for **samakane.com**
3. If available, click **"Purchase"** — should be around **$10.44/year** (at-cost pricing, no markup)
4. Fill in your contact info (this is for the WHOIS registration; Cloudflare provides free privacy protection)
5. Pay with credit card
6. The domain is yours immediately

> **Important:** if `samakane.com` is taken, try variations: `samakane.me`, `samakane.art`, `sama-kane.com`, `foreverroyalsama.com`. The rest of this guide works identically for any domain.

---

## Part 2 — Set up GitHub (5 min)

You need a free GitHub account to store your site files. Cloudflare Pages reads from there to publish your site.

### 2.1 Create a GitHub account

1. Go to https://github.com/signup
2. Create your account (free)

### 2.2 Install GitHub Desktop (the easy way to push updates)

1. Download https://desktop.github.com/
2. Install and sign in with the account you just created

### 2.3 Create your site repository

1. In GitHub Desktop, click **File → New repository**
2. Name: `samakane-site` (or whatever you like)
3. Local path: pick a folder like `C:\Claude\SamaPage` (this is where your site files will live)
4. **Important:** check "Initialize this repository with a README"
5. Click **Create repository**

### 2.4 Copy your site files into the repo folder

Take **all the files I've sent you** in this conversation and copy them into the folder you just created:

```
samakane-site/
├── index.html
├── universe.html
├── sound-engine.js
├── sounds-data.js
├── photo-customizer.js
├── media-manager.js
├── portrait-hero.jpg
├── portrait-hero-nobg.jpg
├── favicon-32.png
├── apple-touch-icon.png
├── og-image.jpg
├── pics-manifest.json
├── videos-manifest.json
├── pics/           (empty folder for now)
├── videos/         (empty folder for now)
└── README.md       (auto-created by GitHub Desktop)
```

### 2.5 Push it to GitHub

1. In GitHub Desktop you'll see all the new files listed
2. At the bottom, type a commit message like **"Initial site"**
3. Click **"Commit to main"**
4. Click **"Publish repository"** (top right) — make it **public** (required for free Cloudflare Pages)

---

## Part 3 — Deploy on Cloudflare Pages (5 min)

### 3.1 Connect Cloudflare to GitHub

1. In Cloudflare dashboard, click **"Workers & Pages"** in the left sidebar
2. Click **"Create application"** → **"Pages"** → **"Connect to Git"**
3. Authorize Cloudflare to access your GitHub account
4. Select your `samakane-site` repository
5. Click **"Begin setup"**

### 3.2 Configure the deployment

- **Project name:** `samakane` (lowercase, no spaces)
- **Production branch:** `main`
- **Build settings:** leave EVERYTHING blank/default (it's a static site — no build needed)
- **Framework preset:** None
- **Build command:** (leave empty)
- **Build output directory:** (leave empty / use the default `/`)

Click **"Save and Deploy"**. In about 30 seconds your site will be live at `https://samakane.pages.dev` — try opening it!

### 3.3 Connect your custom domain

1. After deployment finishes, on the project page click **"Custom domains"**
2. Click **"Set up a custom domain"**
3. Enter `samakane.com`
4. Cloudflare auto-configures DNS since the domain is also registered with them
5. Done — `https://samakane.com` is live in a few minutes, with **automatic HTTPS**

---

## Part 4 — Configure YouTube API key (5 min)

Without this step, your Films section won't show all 48 videos.

### 4.1 Get a YouTube API key

1. Go to https://console.cloud.google.com
2. Top bar → create a new project, name it "Sama Site"
3. Search for "**YouTube Data API v3**" in the top search bar
4. Click it → click **Enable**
5. Left sidebar → **APIs & Services → Credentials**
6. Click **Create Credentials → API key**
7. Copy the key

### 4.2 Restrict the key (important for security)

1. Click the key you just created to edit it
2. Under **Application restrictions**, choose **HTTP referrers**
3. Add these referrers:
   - `https://samakane.com/*`
   - `https://*.samakane.com/*`
   - `https://*.pages.dev/*`
   - `http://localhost/*`
4. Under **API restrictions**, choose **Restrict key** and select only **YouTube Data API v3**
5. Save

### 4.3 Paste the key into your site

1. Open `universe.html` in a text editor (Notepad, VS Code, etc.)
2. Search for `YT_API_KEY`
3. You'll find: `const YT_API_KEY = '';`
4. Paste your key inside the quotes: `const YT_API_KEY = 'AIzaSy...your-key';`
5. Save the file

### 4.4 Push the change

1. Open GitHub Desktop — you'll see `universe.html` listed as changed
2. Commit message: "Add YouTube API key"
3. Click **Commit to main → Push origin**
4. In ~30 seconds, your live site has the key

---

## Part 5 — Setting your admin password

Right now your admin URL is `?admin=samakane2026`. **CHANGE THIS** before going public:

1. Open `index.html` and `universe.html` in a text editor
2. Search for `samakane2026` in each file
3. Replace with your own secret password (any string — keep it private)
4. Save both files
5. Commit + push via GitHub Desktop

To activate admin mode on any device, visit:
```
https://samakane.com/universe.html?admin=YOUR_SECRET_PASSWORD
```
The URL strips itself after activation. Your browser remembers admin mode in localStorage.

To turn admin mode off (e.g. when handing your laptop to someone), visit:
```
https://samakane.com/universe.html?admin=logout
```

---

## Part 6 — Daily publishing workflow

### Adding photos

1. Drop your photos into the `pics/` folder
2. Open `pics-manifest.json` and add entries:

```json
{
  "photos": [
    { "file": "01-studio.jpg", "label": "Studio Session" },
    { "file": "02-tour.jpg",   "label": "On tour, Lisbon" },
    { "file": "03-cover.jpg",  "label": "Album cover shoot" }
  ]
}
```

3. In GitHub Desktop: commit ("New photos") → push
4. Live in ~30 seconds

**Photo tips:**
- Filenames: use lowercase, dashes, no spaces (`01-studio.jpg`, not `IMG 0001.JPG`)
- Resize big photos before adding (use any tool — TinyPNG, Photoshop, etc.) to ~1600px wide for fast loading
- Order in the JSON = order on the page

### Adding videos

1. Drop MP4s into `videos/`
2. (Optional but recommended) Drop a poster image with the same name into `videos/` as well — like `01-studio.mp4` + `01-studio.jpg`
3. Edit `videos-manifest.json`:

```json
{
  "videos": [
    { "file": "01-studio.mp4", "title": "Studio Sessions", "poster": "01-studio.jpg", "width": 1920, "height": 1080 },
    { "file": "02-vertical.mp4", "title": "Reel", "poster": "02-vertical.jpg", "width": 1080, "height": 1920 }
  ]
}
```

4. Commit + push
5. Live in ~30 seconds

**Video tips:**
- Web-compatible MP4 (H.264 codec, AAC audio) — almost any phone or camera MP4 works
- Compress with HandBrake (free) if files are over ~50MB — site loads slower with massive files
- Always include `width` and `height` so the page reserves the right aspect ratio while loading
- Custom poster image looks more polished than browser-generated first frame

---

## Part 7 — How visitors experience the site

**They visit `samakane.com`:**
- Land on the cinematic hero with your portrait
- Click "Enter the Universe" → universe page
- Hear all the UI sound effects, see all the animations
- Browse: Music (Spotify playlist) → Videos (your uploaded MP4s) → Films (YouTube playlist) → Gallery (your photos) → Connect (your socials) → Atelier (AI tools)
- See your full portrait everywhere — but **cannot upload anything**
- **Cannot delete anything**
- **Cannot change your portrait**

**You visit `samakane.com/universe.html?admin=your_password`:**
- Same site but with a small "◆ ADMIN MODE" badge at top
- Upload buttons appear in Videos and Gallery sections
- "Edit Photo" button appears on the landing page
- These uploads ONLY appear in YOUR browser as a staging area — to publish to the live site, commit them to Git

---

## Part 8 — Common questions

**"What if I lose the GitHub Desktop interface?"**
Open Command Prompt in your site folder and run:
```
git add .
git commit -m "Update"
git push
```

**"What if the site doesn't update after a push?"**
Check the Cloudflare Pages dashboard → click your project → "Deployments" tab. You'll see the latest build's status — green check = deployed, red X = error (click to see why).

**"What if I want a custom email like hello@samakane.com?"**
Cloudflare offers free email forwarding. Dashboard → Email → Email Routing → set up `hello@samakane.com` → forwards to your real Gmail. ~2 minutes to configure.

**"How do I update photos and videos from my phone?"**
The GitHub mobile app works but it's clunky for uploads. Easier: use the GitHub website (`github.com/yourname/samakane-site`) on your phone's browser, click "Add file → Upload files", drop the photo there, edit the manifest JSON in their web editor, commit. ~2 minutes.

**"Help, I broke something!"**
Every push creates a new deployment in Cloudflare Pages. You can roll back to any previous version in one click: Cloudflare → Pages → your project → Deployments → click any past deploy → "Rollback to this deployment". Zero risk.

---

## Part 9 — What you get for free, forever

- **Hosting:** unlimited bandwidth, unlimited requests (Cloudflare Pages free tier)
- **SSL/HTTPS:** automatic, auto-renewing
- **CDN:** your site is cached on 300+ servers worldwide, loads instantly anywhere
- **DDoS protection:** built in by Cloudflare
- **Email forwarding:** free for custom domain emails
- **Analytics:** built in (Cloudflare → Web Analytics → opt in)
- **Storage:** unlimited Git repo storage (within reason — GitHub recommends staying under 5GB total)

**Total annual cost: $10.44 for the domain.** That's it.

---

## Done.

You now have a production-grade website with cinematic design, custom sound, YouTube integration, Spotify integration, and a smooth publishing workflow — all for the price of two coffees per year.

Welcome to the internet, Sama. 🪐
