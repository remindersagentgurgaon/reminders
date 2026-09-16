# RenewalFlow

Insurance renewal tracker. Records policy renewal dates, shows what's overdue or due
soon, and opens a pre-written WhatsApp message or a Google Calendar reminder for each
client in one tap. Works on desktop and mobile.

Plain HTML, CSS and JavaScript — no build step, no server, no dependencies to install.

---

## Deploy to GitHub Pages

### 1. Create the repository

Go to [github.com/new](https://github.com/new), name it (for example `renewalflow`),
set it to **Public**, and click **Create repository**.

> Public matters: GitHub Pages only serves private repos on paid plans. Read the
> **Security** section below before putting real client data in a public repo.

### 2. Upload the files

On the empty repo page, click **uploading an existing file**, then drag in
everything from this folder:

```
index.html   script.js   config.js   style.css
icon.svg     manifest.webmanifest    404.html
.nojekyll    README.md    GOOGLE_DRIVE_SETUP.md
```

Click **Commit changes**.

> If `.nojekyll` doesn't appear in the drag-and-drop (some systems hide dotfiles),
> use **Add file → Create new file**, name it `.nojekyll`, leave it empty and commit.

### 3. Turn on Pages

**Settings → Pages**. Under *Build and deployment*:

- Source: **Deploy from a branch**
- Branch: **main**, folder: **/ (root)**
- **Save**

Wait a minute or two, then refresh. Your site is at:

```
https://YOUR-USERNAME.github.io/renewalflow/
```

### 4. Sign in

Default login: username `Rajesh`, password `Rajesh7107`.
Change it — see **Security** below.

The app works fully at this point. Renewals save in the browser. Set up Google Drive
next if you want the same list on your phone and laptop.

### 5. Google Drive sync (optional)

Follow **GOOGLE_DRIVE_SETUP.md**, paste your client ID into `config.js`, then commit
the updated file. In Google Cloud the **Authorized JavaScript origin** is the origin
only — no repo path:

```
https://YOUR-USERNAME.github.io
```

---

## Updating the site later

Open any file in GitHub, click the pencil icon, edit, and commit. Pages redeploys in
about a minute. If you don't see the change, hard-refresh (`Ctrl/Cmd + Shift + R`).

---

## Testing on your own machine

`file://` won't work — sign-in needs a secure context and Google blocks OAuth there.
Run a local server instead:

```bash
cd renewalflow
python3 -m http.server 8000
```

Open `http://localhost:8000`. For Drive testing, add `http://localhost:8000` as an
authorized JavaScript origin too.

---

## Security

**The sign-in screen is a front-door lock, not a safe.** The username and password
hash sit in `config.js`, which anyone can read by viewing the page source. It keeps
casual visitors out of the dashboard. It does not protect the data behind it.

Practical implications:

- Use a password you don't use anywhere else.
- Anyone determined can read the hash and try to crack it offline.
- Renewal records live in the browser's local storage (and your own Google Drive if
  you connect it) — never in the repo — so the data isn't public. But treat the
  dashboard as semi-public and avoid storing anything sensitive beyond name, phone,
  policy type and date.

Change the credentials by generating a new hash with the snippet in `config.js`.

Google Drive is handled properly: the app uses OAuth with the `drive.file` scope, so
it can only see files it created. Your Google password is typed on Google's own page
and never reaches this app. Never put a Google password in `config.js`.

---

## What's in each file

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | All styling, including the mobile layout |
| `script.js` | App logic, Drive sync, WhatsApp and Calendar links |
| `config.js` | **The only file you edit** — client ID, login, country code |
| `manifest.webmanifest`, `icon.svg` | Lets the site install to a phone home screen |
| `.nojekyll` | Stops GitHub reprocessing the files |
| `404.html` | Sends stray URLs back to the dashboard |

---

## Features

- Renewal pipeline with overdue / today / 7-day / 30-day counters
- Search by client name, phone or policy type
- One-tap WhatsApp message with the renewal date filled in
- One-tap Google Calendar reminder (8:30 am on the renewal date; change in `config.js`)
- Google Drive sync across devices, with last-edit-wins merging
- JSON backup/restore and CSV export
- Installable on a phone home screen
