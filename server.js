// Simulated prior authorization payer portal.
// Fake username/password login -> fake 2FA (code printed to console + shown on page) -> dashboard.
// Nothing here talks to a real payer. All data is synthetic.

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { generateRequests, STATUSES, REQUEST_TYPES, fmtDateTime } = require('./data');

const PORT = process.env.PORT || 3000;
const PORTAL_NAME = process.env.PORTAL_NAME || 'Meridian Health Plan';
const FIXED_MFA_CODE = process.env.MFA_CODE || null; // set to e.g. 123456 for deterministic automation tests

// Fake user directory. Any of these work; password is the same for all in the sim.
const USERS = {
  jjackson: { password: 'Password123!', displayName: 'Jackson, Jill', org: 'Springfield Medical Group', npi: '1982718490', phone: '(***) ***-4821' },
  jnurse:   { password: 'Password123!', displayName: 'Nurse, Jane',   org: 'Springfield Medical Group', npi: '1225158454', phone: '(***) ***-7734' },
  ssmith:   { password: 'Password123!', displayName: 'Smith, Sally',  org: 'Springfield Medical Group', npi: '1871558510', phone: '(***) ***-0192' },
};

// Per-session datasets: a fresh random set of requests is generated at every login.
const datasets = new Map();
function getData(req) {
  let rows = datasets.get(req.sessionID);
  if (!rows) { // e.g. server restarted while a session cookie was still valid
    const gen = generateRequests(req.session.dataSeed);
    rows = gen.rows;
    datasets.set(req.sessionID, rows);
  }
  return rows;
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'sim-portal-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 60 * 1000 },
}));

app.locals.portalName = PORTAL_NAME;

// ---------- auth helpers ----------
function requireAuth(req, res, next) {
  if (req.session.user && req.session.mfaVerified) return next();
  if (req.session.user && !req.session.mfaVerified) return res.redirect('/mfa');
  return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

function issueMfaCode(req) {
  const code = FIXED_MFA_CODE || String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  req.session.mfaCode = code;
  req.session.mfaIssuedAt = Date.now();
  req.session.mfaAttempts = 0;
  console.log(`[SIM 2FA] Code for ${req.session.user.username}: ${code}`);
  return code;
}

// ---------- routes: auth ----------
app.get('/', (req, res) => res.redirect('/requests'));

app.get('/login', (req, res) => {
  if (req.session.user && req.session.mfaVerified) return res.redirect('/requests');
  let notice = null;
  if (req.query.locked) notice = 'Too many invalid verification attempts. Please sign in again.';
  else if (req.query.loggedout) notice = 'You have been signed out.';
  res.render('login', { error: null, notice, username: '', next: req.query.next || '' });
});

app.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).render('login', {
      error: 'The User ID or Password you entered is incorrect. Please try again.',
      notice: null,
      username,
      next: req.body.next || '',
    });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).send('Session error');
    req.session.user = { username, ...user, password: undefined };
    req.session.mfaVerified = false;
    req.session.next = req.body.next || '';
    const gen = generateRequests();
    datasets.set(req.sessionID, gen.rows);
    req.session.dataSeed = gen.seed;
    console.log(`[SIM DATA] Generated ${gen.rows.length} requests for ${username} (seed ${gen.seed})`);
    issueMfaCode(req);
    res.redirect('/mfa');
  });
});

app.get('/mfa', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.mfaVerified) return res.redirect('/requests');
  res.render('mfa', {
    error: null,
    user: req.session.user,
    simCode: req.session.mfaCode, // shown in the "simulated SMS" panel for testing
    resent: req.query.resent === '1',
  });
});

app.post('/mfa', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const submitted = String(req.body.code || '').replace(/\D/g, '');
  const expired = Date.now() - (req.session.mfaIssuedAt || 0) > 10 * 60 * 1000;
  req.session.mfaAttempts = (req.session.mfaAttempts || 0) + 1;

  if (expired) {
    return res.status(400).render('mfa', {
      error: 'Your verification code has expired. Please request a new code.',
      user: req.session.user, simCode: req.session.mfaCode, resent: false,
    });
  }
  if (submitted !== req.session.mfaCode) {
    if (req.session.mfaAttempts >= 5) {
      return req.session.destroy(() => res.redirect('/login?locked=1'));
    }
    return res.status(401).render('mfa', {
      error: `The verification code you entered is invalid. ${5 - req.session.mfaAttempts} attempt(s) remaining.`,
      user: req.session.user, simCode: req.session.mfaCode, resent: false,
    });
  }
  req.session.mfaVerified = true;
  const next = req.session.next && req.session.next.startsWith('/') ? req.session.next : '/requests';
  delete req.session.next;
  delete req.session.mfaCode;
  res.redirect(next);
});

app.post('/mfa/resend', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  issueMfaCode(req);
  res.redirect('/mfa?resent=1');
});

app.get('/logout', (req, res) => {
  datasets.delete(req.sessionID);
  req.session.destroy(() => res.redirect('/login?loggedout=1'));
});

// ---------- routes: portal ----------
const SORTABLE = {
  trackingId: (r) => r.trackingId,
  referenceNumber: (r) => r.referenceNumber,
  status: (r) => r.status,
  patientName: (r) => r.patientName,
  serviceStart: (r) => r.serviceStart,
  requestType: (r) => r.requestType,
  providerNpi: (r) => r.providerNpi,
  submitDate: (r) => r.submitDate,
  createdBy: (r) => r.createdBy,
  updatedDate: (r) => r.updatedDate,
  updatedBy: (r) => r.updatedBy,
};

function queryRequests(all, q) {
  let rows = all.slice();

  // filters
  if (q.status) rows = rows.filter((r) => r.status === q.status);
  if (q.requestType) rows = rows.filter((r) => r.requestType === q.requestType);
  if (q.patient) {
    const needle = q.patient.toLowerCase();
    rows = rows.filter((r) => r.patientName.toLowerCase().includes(needle));
  }
  if (q.trackingId) rows = rows.filter((r) => String(r.trackingId).includes(q.trackingId.trim()));
  if (q.referenceNumber) rows = rows.filter((r) => r.referenceNumber.toLowerCase().includes(q.referenceNumber.trim().toLowerCase()));
  if (q.npi) rows = rows.filter((r) => r.providerNpi.includes(q.npi.trim()));

  // sort
  const sort = SORTABLE[q.sort] ? q.sort : 'updatedDate';
  const dir = q.dir === 'asc' ? 1 : -1;
  const key = SORTABLE[sort];
  rows.sort((a, b) => {
    const av = key(a), bv = key(b);
    if (av === bv) return 0;
    if (av === '' || av == null) return 1;
    if (bv === '' || bv == null) return -1;
    return (av < bv ? -1 : 1) * dir;
  });

  // paginate
  const size = [10, 20, 50, 100].includes(Number(q.size)) ? Number(q.size) : 20;
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  let page = parseInt(q.page, 10) || 1;
  page = Math.min(Math.max(page, 1), totalPages);
  const start = (page - 1) * size;
  const pageRows = rows.slice(start, start + size);

  return {
    rows: pageRows, total, totalPages, page, size, sort, dir,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + size, total),
  };
}

app.get('/requests', requireAuth, (req, res) => {
  const result = queryRequests(getData(req), req.query);
  res.render('requests', {
    user: req.session.user,
    active: 'requests',
    result,
    query: req.query,
    statuses: STATUSES,
    requestTypes: REQUEST_TYPES,
  });
});

// JSON version, handy for automation checks
app.get('/api/requests', requireAuth, (req, res) => {
  res.json(queryRequests(getData(req), req.query));
});

app.get('/requests/:id', requireAuth, (req, res) => {
  const row = getData(req).find((r) => String(r.trackingId) === req.params.id);
  if (!row) return res.status(404).render('placeholder', { user: req.session.user, active: 'requests', title: 'Request Not Found', message: `No request with Tracking ID ${req.params.id} was found.` });
  res.render('detail', { user: req.session.user, active: 'requests', row });
});

app.get('/requests/new', requireAuth, (req, res) => res.redirect('/create'));
app.get('/create', requireAuth, (req, res) => {
  res.render('create', { user: req.session.user, active: 'create', requestTypes: REQUEST_TYPES, created: null });
});
app.post('/create', requireAuth, (req, res) => {
  const b = req.body;
  const data = getData(req);
  const last = data.reduce((m, r) => Math.max(m, r.trackingId), 0);
  const stamp = fmtDateTime(new Date());
  const submit = b.action === 'submit';
  const row = {
    trackingId: last + 1,
    referenceNumber: submit ? 'UM' + (330000 + data.length) : '',
    status: submit ? 'Submitted' : 'Not Submitted',
    patientName: `${(b.lastName || 'Unknown').trim()}, ${(b.firstName || '').trim()}`.trim(),
    serviceStart: b.serviceStart || '', serviceEnd: b.serviceEnd || b.serviceStart || '',
    requestType: b.requestType || 'Outpatient',
    providerNpi: (b.providerNpi || '').replace(/\D/g, ''),
    submitDate: submit ? stamp : '',
    createdBy: req.session.user.displayName,
    updatedDate: stamp, updatedBy: req.session.user.displayName,
    memberId: b.memberId || '', dob: b.dob || '', serviceCode: b.serviceCode || '', diagnosis: b.diagnosis || '',
    units: Number(b.units) || 1, servicingProvider: b.servicingProvider || req.session.user.org,
  };
  data.unshift(row);
  res.render('create', { user: req.session.user, active: 'create', requestTypes: REQUEST_TYPES, created: row });
});

app.get('/search', requireAuth, (req, res) => {
  const hasQuery = Object.keys(req.query).length > 0;
  const result = hasQuery ? queryRequests(getData(req), { ...req.query, size: req.query.size || 20 }) : null;
  res.render('search', { user: req.session.user, active: 'search', result, query: req.query, statuses: STATUSES, requestTypes: REQUEST_TYPES });
});

app.get('/case-status', requireAuth, (req, res) => {
  const ref = (req.query.referenceNumber || '').trim().toUpperCase();
  const row = ref ? getData(req).find((r) => r.referenceNumber === ref) : null;
  res.render('case-status', { user: req.session.user, active: 'status', ref, row, searched: !!ref });
});

app.listen(PORT, () => {
  console.log(`\n${PORTAL_NAME} — simulated prior auth portal`);
  console.log(`  http://localhost:${PORT}/login`);
  console.log(`  Users: ${Object.keys(USERS).join(', ')}   Password: Password123!`);
  console.log('  Data:  a fresh random dataset (350-549 requests) is generated on every login');
  console.log(`  2FA:   ${FIXED_MFA_CODE ? 'fixed code ' + FIXED_MFA_CODE : 'random 6-digit code, printed here and shown on the MFA page'}\n`);
});
