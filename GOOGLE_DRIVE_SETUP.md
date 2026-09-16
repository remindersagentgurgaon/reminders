# Google Drive setup

Optional. Without it RenewalFlow still works — records just stay in one browser.
With it, the same renewal list appears on your laptop and your phone.

The app keeps your records in a single private file in your Drive, named
`RenewalFlow-data.json`.

## Before you start

**Never type your Google password into this website.** Sign-in happens on Google's
own page through OAuth. The app only ever receives a temporary access token, and it
never sees or stores your password. There is no field in `config.js` for a Google
password, and you should never add one.

Deploy the site first (see README.md). You need its address before step 5.

---

## One-time setup in Google Cloud

**1. Create a project**
Open [console.cloud.google.com](https://console.cloud.google.com/), click the project
dropdown at the top, then **New project**. Name it `RenewalFlow` and create it. Make
sure it's selected before continuing.

**2. Enable the Drive API**
**APIs & Services → Library**, search for **Google Drive API**, open it, click
**Enable**.

**3. Configure the consent screen**
**APIs & Services → OAuth consent screen**.

- User type: **External**
- App name: `RenewalFlow`
- User support email and developer contact: your own email
- Save and continue through the Scopes screen (nothing to add — the app requests its
  scope at sign-in time)
- On **Test users**, click **Add users** and add the Google account whose Drive you
  want to use. Add every account that will sign in.
- Leave the app in **Testing**. You don't need to publish or get verified for
  personal use.

**4. Create the client ID**
**APIs & Services → Credentials → Create credentials → OAuth client ID**.

- Application type: **Web application**
- Name: `RenewalFlow web`

**5. Add your site as an authorized origin**
Under **Authorized JavaScript origins**, click **Add URI** and enter the origin of
your site — the domain only, with no repository path and no trailing slash:

```
https://YOUR-USERNAME.github.io
```

Add this too if you want to test locally:

```
http://localhost:8000
```

Leave **Authorized redirect URIs** empty. Click **Create** and copy the client ID.
It looks like `1234567890-abcdef.apps.googleusercontent.com`.

**6. Paste it into the app**
Open `config.js` in your repository, click the pencil icon, and replace the
placeholder:

```js
googleClientId: '1234567890-abcdef.apps.googleusercontent.com',
```

Commit the change and wait about a minute for GitHub Pages to redeploy.

**7. Connect**
Open your site, sign in, and click **☁ Drive: Not connected** in the top right.
Choose your Google account and allow access. The button changes to **☁ Drive: Synced**.

Google will show an "unverified app" warning because the project is in Testing mode.
Click **Advanced → Go to RenewalFlow (unsafe)** to continue. It's your own project;
the warning just means Google hasn't reviewed it.

---

## How syncing behaves

- Every save, edit and delete writes to Drive straight away.
- Records are merged rather than overwritten. If you add a client on your phone and a
  different one on your laptop, you end up with both. When the same record is edited
  in two places, the most recent edit wins.
- Deletes propagate. A record deleted on one device disappears on the other.
- The browser reconnects to Drive automatically on later visits — you only authorize
  once per browser.
- Drive unreachable or the token expired? The app keeps working from local storage
  and shows **Drive: Sync error** or **Drive: Reconnect**. Nothing is lost; click the
  button to reconnect.
- The tab re-syncs when you switch back to it, so a device left open picks up changes
  made elsewhere.

To use the same data on a second device, open the site there, sign in, and connect
the **same Google account**.

---

## Security

The requested scope is `drive.file` — the narrowest Drive scope available. The app
can only open files it created itself. It cannot read, list or touch anything else in
your Drive.

---

## If it doesn't work

| What you see | Cause |
|---|---|
| **Drive: Off** | No client ID in `config.js`, or the change hasn't deployed yet |
| `redirect_uri_mismatch` / `origin_mismatch` | The origin in step 5 doesn't exactly match your site. Check `https` vs `http`, and that there's no path or trailing slash |
| `access_denied` after choosing an account | That account isn't in **Test users**. Add it in the consent screen |
| **Drive: Sync error** | Token expired or network dropped. Click the button to reconnect |
| Nothing happens on click | A popup blocker. Allow popups for your site |

Origin changes in Google Cloud can take a few minutes to take effect. If a fix looks
correct but still fails, wait five minutes and retry in a fresh tab.
