# 🚀 Upp — Setup Guide

Follow these steps in order. The whole process takes about 20–30 minutes.

---

## Step 1 — Install the tools you need

1. Download and install **Node.js** (free): https://nodejs.org → click "LTS" version
2. Download and install **Git** (free): https://git-scm.com/download/win
3. Restart your computer after installing both

---

## Step 2 — Create your accounts (all free)

- **GitHub**: https://github.com/signup
- **Supabase**: https://supabase.com (click "Start your project", sign in with GitHub)
- **Vercel**: https://vercel.com/signup (sign in with GitHub)

---

## Step 3 — Set up Supabase (your database + login system)

1. Go to https://supabase.com/dashboard and click **"New project"**
2. Give it a name (e.g. `upp`) and set a strong database password — save it somewhere
3. Wait ~2 minutes for it to set up
4. Click **"SQL Editor"** in the left sidebar
5. Click **"New query"** and paste in ALL of the SQL from the file `supabase-schema.sql` (in this folder)
6. Click **"Run"** — you should see "Success"
7. Go to **Project Settings → API** (left sidebar)
8. Copy your **Project URL** and **anon public** key — you'll need these in Step 5

---

## Step 4 — Put the project on GitHub

Open **Command Prompt** (search "cmd" in Windows Start menu) and run these commands one at a time:

```
cd Desktop
git init upp
cd upp
```

Then copy all the files from this folder into the `upp` folder on your Desktop.

```
git add .
git commit -m "Initial Upp project"
```

Now go to https://github.com/new and create a new repository called `upp` (leave it Public, don't add anything extra).

GitHub will show you two commands — copy and run the ones under **"…or push an existing repository from the command line"**. They look like:

```
git remote add origin https://github.com/YOURUSERNAME/upp.git
git branch -M main
git push -u origin main
```

---

## Step 5 — Deploy on Vercel

1. Go to https://vercel.com/new
2. Click **"Import"** next to your `upp` GitHub repo
3. Under **"Environment Variables"**, add two variables:
   - `REACT_APP_SUPABASE_URL` → paste your Supabase Project URL
   - `REACT_APP_SUPABASE_ANON_KEY` → paste your Supabase anon key
4. Click **Deploy** — wait about 2 minutes
5. Vercel gives you a live URL like `https://upp-yourname.vercel.app` 🎉

---

## Step 6 — Test it

Visit your live URL, register an account, post an event with a map pin, and check the map page!

---

## Making changes in the future

1. Edit any file in the `upp` folder on your Desktop
2. Open Command Prompt and run:
```
cd Desktop/upp
git add .
git commit -m "describe what you changed"
git push
```
3. Vercel auto-deploys within ~60 seconds — your live site updates automatically ✅

---

## Getting help

If anything goes wrong, just copy the error message and ask Claude — paste exactly what you see and Claude will fix it.
