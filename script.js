'use strict';

/* RenewalFlow — renewal tracking with optional Google Drive sync.
   All settings live in config.js. No Google password is ever handled
   by this app: sign-in happens on Google's own page via OAuth. */

const CFG = Object.assign({
  googleClientId: '',
  driveFileName: 'RenewalFlow-data.json',
  username: 'Rajesh',
  passwordHash: '',
  defaultCountryCode: '91',
  reminderTime: '08:30'
}, window.RENEWALFLOW_CONFIG || {});

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const KEY = 'renewalflow_data_v4', AUTH = 'renewalflow_auth';
const TOMBSTONE_DAYS = 60;

let data = loadData();
let driveToken = null;
let tokenExpiry = 0;
let tokenClient = null;
let driveFileId = null;
let driveReady = false;
let syncing = false;
let pendingSync = false;

const $ = id => document.getElementById(id);
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const configured = () => !!CFG.googleClientId && !CFG.googleClientId.startsWith('PASTE_');
const live = () => data.filter(r => r && r.date && !r.deleted);

/* ---------- storage ---------- */

function loadData() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.map(normalise).filter(Boolean) : [];
  } catch { return []; }
}

function normalise(r) {
  if (!r || typeof r !== 'object' || !r.id) return null;
  if (!r.updatedAt) r.updatedAt = 0;
  return r;
}

function cache() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (err) { console.error(err); toast('Could not save locally — browser storage may be full.'); }
}

function stamp(r) { r.updatedAt = Date.now(); return r; }

function prune() {
  const cutoff = Date.now() - TOMBSTONE_DAYS * 86400000;
  data = data.filter(r => !(r.deleted && r.updatedAt < cutoff));
}

/* Last-write-wins merge so records added on one device are never
   lost when another device's copy is pulled from Drive. */
function merge(local, remote) {
  const out = new Map();
  for (const r of [...local, ...remote]) {
    const rec = normalise(r);
    if (!rec) continue;
    const seen = out.get(rec.id);
    if (!seen || (rec.updatedAt || 0) >= (seen.updatedAt || 0)) out.set(rec.id, rec);
  }
  return [...out.values()];
}

/* ---------- helpers ---------- */

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function days(s) { return Math.ceil((new Date(s + 'T00:00:00') - today()) / 86400000); }
function prettyDate(s) { return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function initials(n) { return (n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
function status(d) { if (d < 0) return ['overdue', Math.abs(d) + 'd overdue']; if (d === 0) return ['today', 'Due today']; if (d <= 7) return ['soon', 'Due in ' + d + 'd']; return ['later', 'Due in ' + d + 'd']; }
function cleanPhone(p) { return String(p || '').replace(/\D/g, ''); }
function whatsappPhone(p) { let n = cleanPhone(p); if (n.length === 10) n = CFG.defaultCountryCode + n; return n; }
function message(r) { return `Hello ${r.name}, your ${(r.type || 'insurance').toLowerCase()} insurance renewal is due on ${prettyDate(r.date)}. Please contact me if you would like assistance with the renewal.`; }
function openExternal(url) { const w = window.open(url, '_blank', 'noopener,noreferrer'); if (!w) location.href = url; }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }

function openWhatsApp(r) {
  const n = whatsappPhone(r.phone);
  if (n.length < 11) { alert('Enter a valid WhatsApp number — 10 digits, or include the country code.'); return; }
  openExternal(`https://wa.me/${n}?text=${encodeURIComponent(message(r))}`);
}

function calendarUrl(r) {
  const pad = n => String(n).padStart(2, '0');
  const [y, m, d] = r.date.split('-').map(Number);
  const [hh, mm] = String(CFG.reminderTime || '08:30').split(':').map(Number);
  const start = `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
  const e = new Date(y, m - 1, d, hh, mm);
  e.setMinutes(e.getMinutes() + 30);
  const end = `${e.getFullYear()}${pad(e.getMonth() + 1)}${pad(e.getDate())}T${pad(e.getHours())}${pad(e.getMinutes())}00`;
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', `Insurance Renewal — ${r.name}`);
  u.searchParams.set('dates', `${start}/${end}`);
  u.searchParams.set('details', `${message(r)}\n\nCreated from RenewalFlow.`);
  return u.toString();
}
function openCalendar(r) { openExternal(calendarUrl(r)); }

let toastTimer;
function toast(text) {
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

/* ---------- Google Drive ---------- */

function setDriveStatus(text, connected = false) {
  const b = $('driveStatus');
  if (!b) return;
  b.textContent = connected ? '☁ Drive: Synced' : '☁ Drive: ' + text;
  b.classList.toggle('primary', connected);
  b.classList.toggle('secondary', !connected);
}

function initGoogleDrive() {
  if (!configured()) { setDriveStatus('Off'); return; }
  if (!window.google?.accounts?.oauth2) { setDriveStatus('Loading…'); setTimeout(initGoogleDrive, 400); return; }
  if (tokenClient) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CFG.googleClientId,
    scope: DRIVE_SCOPE,
    callback: async response => {
      if (response.error) {
        console.error(response);
        setDriveStatus('Not connected');
        if (response.error !== 'access_denied') toast('Google sign-in did not complete. Try again.');
        return;
      }
      driveToken = response.access_token;
      tokenExpiry = Date.now() + (Number(response.expires_in || 3600) - 120) * 1000;
      driveReady = true;
      localStorage.setItem('renewalflow_drive_opt_in', '1');
      setDriveStatus('Syncing…');
      await syncNow(true);
    }
  });
  setDriveStatus('Not connected');
  /* Reconnect silently if this browser has connected before. */
  if (localStorage.getItem('renewalflow_drive_opt_in') === '1') requestToken(true);
}

function requestToken(silent) {
  if (!tokenClient) { initGoogleDrive(); return; }
  tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' });
}

function connectDrive() {
  if (!configured()) {
    alert('Google Drive is not set up yet.\n\nAdd your Google OAuth client ID to config.js and redeploy. See GOOGLE_DRIVE_SETUP.md.\n\nYour renewals are saved in this browser in the meantime.');
    return;
  }
  if (driveReady) { syncNow(false); return; }
  requestToken(false);
}

async function driveFetch(url, options = {}) {
  if (!driveToken) throw new Error('Google Drive is not connected');
  const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + driveToken } });
  if (res.status === 401 || res.status === 403) {
    driveToken = null; driveReady = false; tokenExpiry = 0;
    setDriveStatus('Reconnect');
    throw new Error('Google Drive authorisation expired');
  }
  if (!res.ok) throw new Error('Drive request failed: ' + res.status);
  return res;
}

async function ensureToken() {
  if (driveToken && Date.now() < tokenExpiry) return true;
  if (!tokenClient) return false;
  requestToken(true);
  return false;
}

async function findDriveFile() {
  const q = `name = '${CFG.driveFileName.replace(/'/g, "\\'")}' and trashed = false`;
  const url = 'https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id,name,modifiedTime)&q=' + encodeURIComponent(q);
  const j = await (await driveFetch(url)).json();
  return j.files?.[0] || null;
}

async function uploadDriveFile(records) {
  const metadata = { name: CFG.driveFileName, mimeType: 'application/json' };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  body.append('file', new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
  const endpoint = driveFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(driveFileId)}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
  const j = await (await driveFetch(endpoint, { method: driveFileId ? 'PATCH' : 'POST', body })).json();
  if (j.id) driveFileId = j.id;
}

/* Pull, merge, push. Safe to call repeatedly; overlapping calls queue. */
async function syncNow(announce) {
  if (!driveReady) return;
  if (syncing) { pendingSync = true; return; }
  syncing = true;
  setDriveStatus('Syncing…');
  try {
    if (!driveToken || Date.now() >= tokenExpiry) { await ensureToken(); if (!driveToken) return; }
    if (!driveFileId) {
      const f = await findDriveFile();
      if (f) driveFileId = f.id;
    }
    if (driveFileId) {
      const remote = await (await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`)).json();
      if (Array.isArray(remote)) data = merge(data, remote);
    }
    prune();
    await uploadDriveFile(data);
    cache();
    render();
    setDriveStatus('Synced', true);
    if (announce) toast('Google Drive connected. Your renewals now sync across devices.');
  } catch (err) {
    console.error(err);
    if (driveReady) setDriveStatus('Sync error');
    toast('Drive sync failed. Your renewals are still saved in this browser.');
  } finally {
    syncing = false;
    if (pendingSync) { pendingSync = false; syncNow(false); }
  }
}

/* ---------- persistence entry point ---------- */

function save() {
  prune();
  cache();
  render();
  if (driveReady) syncNow(false);
}

/* ---------- rendering ---------- */

function render() {
  if ($('app').classList.contains('hidden')) return;
  const all = live();
  const q = ($('search').value || '').toLowerCase().trim();
  const f = $('filter').value;
  const overdue = all.filter(x => days(x.date) < 0).length;
  const t = all.filter(x => days(x.date) === 0).length;
  const seven = all.filter(x => days(x.date) >= 0 && days(x.date) <= 7).length;
  const thirty = all.filter(x => days(x.date) >= 0 && days(x.date) <= 30).length;
  $('overdue').textContent = overdue; $('today').textContent = t;
  $('seven').textContent = seven; $('thirty').textContent = thirty;
  $('heroTotal').textContent = all.length;
  $('morning').textContent = overdue
    ? `${overdue} overdue renewal${overdue > 1 ? 's' : ''} need attention first.`
    : t ? `${t} renewal${t > 1 ? 's' : ''} due today. Start your WhatsApp follow-ups.`
      : seven ? `${seven} priority renewal${seven > 1 ? 's' : ''} in the next 7 days.`
        : 'No urgent renewals — your pipeline is clear.';

  const list = all
    .filter(r => `${r.name} ${r.type} ${r.phone}`.toLowerCase().includes(q))
    .filter(r => {
      const d = days(r.date);
      return f === 'all' || f === 'overdue' && d < 0 || f === 'today' && d === 0 || f === '7' && d >= 0 && d <= 7 || f === '30' && d >= 0 && d <= 30;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  $('empty').style.display = list.length ? 'none' : 'block';
  $('emptyTitle').textContent = all.length ? 'Nothing matches this view' : 'No renewals yet';
  $('emptyText').textContent = all.length
    ? 'Clear the search box or switch the filter back to All.'
    : 'Add your first policy to build your private renewal pipeline.';
  $('add3').classList.toggle('hidden', !!all.length);

  $('list').innerHTML = list.map(r => {
    const [s, b] = status(days(r.date));
    return `<article class="card"><div class="client"><div class="avatar">${escapeHtml(initials(r.name))}</div><div><b>${escapeHtml(r.name)}</b><span class="muted">${escapeHtml(r.type)} · ${escapeHtml(r.phone)}</span></div></div><div class="status"><b>${escapeHtml(prettyDate(r.date))}</b><span class="badge ${s}">${escapeHtml(b)}</span></div><div class="cardactions"><button class="mini wa" data-action="wa" data-id="${escapeHtml(r.id)}" title="Send WhatsApp reminder" aria-label="Send WhatsApp reminder to ${escapeHtml(r.name)}">☘</button><button class="mini cal" data-action="cal" data-id="${escapeHtml(r.id)}" title="Add to Google Calendar" aria-label="Add calendar reminder for ${escapeHtml(r.name)}">📅</button><button class="mini" data-action="edit" data-id="${escapeHtml(r.id)}" title="Edit renewal" aria-label="Edit ${escapeHtml(r.name)}">✎</button><button class="mini delete-mini" data-action="delete" data-id="${escapeHtml(r.id)}" title="Delete renewal" aria-label="Delete ${escapeHtml(r.name)}">🗑</button></div></article>`;
  }).join('');
}

/* ---------- records ---------- */

function removeRecord(id) {
  const i = data.findIndex(x => x.id === id);
  if (i < 0) return;
  data[i] = stamp({ id, deleted: true });   // tombstone, so the delete syncs
  save();
}

function deleteRenewal(id) {
  const r = data.find(x => x.id === id);
  if (!r) return;
  if (confirm(`Delete ${r.name}'s renewal record? This cannot be undone.`)) removeRecord(id);
}

function openForm(r = null) {
  $('form').reset();
  $('id').value = r?.id || '';
  $('modalTitle').textContent = r ? 'Edit renewal' : 'Add renewal';
  $('name').value = r?.name || '';
  $('phone').value = r?.phone || '';
  $('type').value = r?.type || 'Life Insurance';
  $('date').value = r?.date || new Date().toISOString().slice(0, 10);
  $('del').classList.toggle('hidden', !r);
  updatePreview();
  $('dlg').showModal();
  $('name').focus();
}

function updatePreview() {
  $('preview').textContent = message({
    name: $('name').value || 'Customer',
    type: $('type').value,
    date: $('date').value || new Date().toISOString().slice(0, 10)
  });
}

/* ---------- import / export ---------- */

function downloadBlob(text, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function csvExport() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Name', 'WhatsApp Number', 'Insurance Type', 'Renewal Date'];
  const rows = live().sort((a, b) => new Date(a.date) - new Date(b.date));
  downloadBlob([head.map(q).join(','), ...rows.map(r => [r.name, r.phone, r.type, r.date].map(q).join(','))].join('\n'),
    'renewalflow-policies.csv', 'text/csv;charset=utf-8');
}

/* ---------- sign in ---------- */

async function sha256(text) {
  if (!window.crypto?.subtle) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function showApp() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  render();
  initGoogleDrive();
}

async function login() {
  const user = $('loginUser').value.trim();
  const pass = $('loginPass').value;
  const hash = await sha256(user + ':' + pass);
  if (hash === null) {
    $('loginError').textContent = 'Sign-in needs a secure connection. Open the site over https, or use http://localhost for local testing.';
    return;
  }
  if (user.toLowerCase() === String(CFG.username).toLowerCase() && hash === CFG.passwordHash) {
    sessionStorage.setItem(AUTH, '1');
    $('loginError').textContent = '';
    $('loginPass').value = '';
    showApp();
  } else {
    $('loginError').textContent = 'That username and password do not match.';
  }
}

/* ---------- wiring ---------- */

$('loginForm').addEventListener('submit', e => { e.preventDefault(); login(); });
$('logout').addEventListener('click', () => {
  sessionStorage.removeItem(AUTH);
  $('app').classList.add('hidden');
  $('loginScreen').classList.remove('hidden');
  $('loginPass').value = '';
});

$('driveStatus').addEventListener('click', connectDrive);
['add', 'add2', 'add3'].forEach(id => $(id).addEventListener('click', () => openForm()));
$('cancel').addEventListener('click', () => $('dlg').close());
$('x').addEventListener('click', () => $('dlg').close());
['name', 'date', 'type', 'phone'].forEach(id => $(id).addEventListener('input', updatePreview));

$('form').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('id').value;
  const r = stamp({
    id: id || uid(),
    name: $('name').value.trim(),
    phone: $('phone').value.trim(),
    type: $('type').value,
    date: $('date').value
  });
  if (!r.name || !r.phone || !r.date) return;
  const i = data.findIndex(x => x.id === r.id);
  if (i >= 0) data[i] = r; else data.push(r);
  save();
  $('dlg').close();
  toast(id ? 'Renewal updated.' : 'Renewal added.');
});

$('del').addEventListener('click', () => {
  const id = $('id').value;
  if (id && confirm('Delete this renewal?')) { removeRecord(id); $('dlg').close(); }
});

$('list').addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const r = data.find(x => x.id === b.dataset.id);
  if (!r) return;
  const a = b.dataset.action;
  if (a === 'wa') openWhatsApp(r);
  if (a === 'cal') openCalendar(r);
  if (a === 'edit') openForm(r);
  if (a === 'delete') deleteRenewal(r.id);
});

$('search').addEventListener('input', render);
$('filter').addEventListener('change', render);
$('priority').addEventListener('click', () => {
  $('filter').value = '7';
  render();
  $('list').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('backup').addEventListener('click', () => downloadBlob(JSON.stringify(data, null, 2), 'renewalflow-backup.json', 'application/json'));
$('csv').addEventListener('click', csvExport);

$('import').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const x = JSON.parse(rd.result);
      if (!Array.isArray(x)) throw new Error('not an array');
      if (confirm(`Add ${x.length} record${x.length === 1 ? '' : 's'} from this backup? Matching records will be updated.`)) {
        data = merge(data, x.map(r => normalise(r)).filter(Boolean));
        save();
        toast('Backup imported.');
      }
    } catch { alert('That file is not a RenewalFlow backup.'); }
    e.target.value = '';
  };
  rd.readAsText(f);
});

$('bell').addEventListener('click', async () => {
  if (!('Notification' in window)) return alert('This browser does not support notifications.');
  const p = await Notification.requestPermission();
  if (p === 'granted') new Notification('RenewalFlow', { body: 'Reminders are on. WhatsApp messages still need a tap to send.' });
  else toast('Notifications are blocked. Turn them on in your browser settings.');
});

/* Re-sync when the tab comes back into focus on another device. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && driveReady) syncNow(false);
});

if (sessionStorage.getItem(AUTH) === '1') showApp();
else render();
