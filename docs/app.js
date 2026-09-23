/* Static single-page version of the simulated prior auth portal (GitHub Pages).
   Fake login -> fake 2FA -> requests grid. All state lives in sessionStorage; a new
   random dataset is generated on every login. Nothing is sent to any server. */
(function () {
  'use strict';
  const { generateRequests, STATUSES, REQUEST_TYPES, fmtDateTime } = window.SimData;
  const PORTAL_NAME = 'Meridian Health Plan';
  const FIXED_MFA_CODE = null; // set to e.g. '123456' for deterministic tests
  const USERS = {
    jjackson: { password: 'Password123!', displayName: 'Jackson, Jill', org: 'Springfield Medical Group', phone: '(***) ***-4821' },
    jnurse:   { password: 'Password123!', displayName: 'Nurse, Jane',   org: 'Springfield Medical Group', phone: '(***) ***-7734' },
    ssmith:   { password: 'Password123!', displayName: 'Smith, Sally',  org: 'Springfield Medical Group', phone: '(***) ***-0192' },
  };

  // ---------- session (sessionStorage) ----------
  const S = {
    get() { try { return JSON.parse(sessionStorage.getItem('sim.session') || 'null'); } catch { return null; } },
    set(v) { try { sessionStorage.setItem('sim.session', JSON.stringify(v)); } catch {} },
    clear() { try { sessionStorage.removeItem('sim.session'); sessionStorage.removeItem('sim.created'); } catch {} },
  };
  let DATA = null; // current dataset (regenerated from the session seed on reload)
  function getData() {
    const s = S.get();
    if (!s) return [];
    if (!DATA || DATA.seed !== s.dataSeed) {
      const gen = generateRequests(s.dataSeed);
      let created = [];
      try { created = JSON.parse(sessionStorage.getItem('sim.created') || '[]'); } catch {}
      DATA = { seed: s.dataSeed, rows: [...created, ...gen.rows] };
    }
    return DATA.rows;
  }
  function addCreated(row) {
    getData().unshift(row);
    let created = [];
    try { created = JSON.parse(sessionStorage.getItem('sim.created') || '[]'); } catch {}
    created.unshift(row);
    try { sessionStorage.setItem('sim.created', JSON.stringify(created)); } catch {}
  }
  function issueMfaCode(s) {
    s.mfaCode = FIXED_MFA_CODE || String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    s.mfaIssuedAt = Date.now();
    s.mfaAttempts = 0;
    console.log(`[SIM 2FA] Code for ${s.username}: ${s.mfaCode}`);
    S.set(s);
  }

  // ---------- helpers ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = document.getElementById('app');
  function render(html, cls) { document.body.className = cls || ''; app.innerHTML = html; window.scrollTo(0, 0); }
  function go(hash) { location.hash = hash; }
  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '') || 'login';
    const [path, qs] = h.split('?');
    const query = {};
    new URLSearchParams(qs || '').forEach((v, k) => { query[k] = v; });
    return { path, query };
  }
  function buildHash(path, params) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) if (v !== '' && v != null) p.set(k, v);
    const q = p.toString();
    return '#/' + path + (q ? '?' + q : '');
  }

  const SORTABLE = ['trackingId', 'referenceNumber', 'status', 'patientName', 'serviceStart', 'requestType', 'providerNpi', 'submitDate', 'createdBy', 'updatedDate', 'updatedBy'];
  function queryRequests(all, q) {
    let rows = all.slice();
    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.requestType) rows = rows.filter((r) => r.requestType === q.requestType);
    if (q.patient) { const n = q.patient.toLowerCase(); rows = rows.filter((r) => r.patientName.toLowerCase().includes(n)); }
    if (q.trackingId) rows = rows.filter((r) => String(r.trackingId).includes(q.trackingId.trim()));
    if (q.referenceNumber) rows = rows.filter((r) => r.referenceNumber.toLowerCase().includes(q.referenceNumber.trim().toLowerCase()));
    if (q.npi) rows = rows.filter((r) => r.providerNpi.includes(q.npi.trim()));
    const sort = SORTABLE.includes(q.sort) ? q.sort : 'updatedDate';
    const dir = q.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sort], bv = b[sort];
      if (av === bv) return 0;
      if (av === '' || av == null) return 1;
      if (bv === '' || bv == null) return -1;
      return (av < bv ? -1 : 1) * dir;
    });
    const size = [10, 20, 50, 100].includes(Number(q.size)) ? Number(q.size) : 20;
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    let page = parseInt(q.page, 10) || 1;
    page = Math.min(Math.max(page, 1), totalPages);
    const start = (page - 1) * size;
    return { rows: rows.slice(start, start + size), total, totalPages, page, size, sort, dir, from: total ? start + 1 : 0, to: Math.min(start + size, total) };
  }
  window.simQueryRequests = (q) => queryRequests(getData(), q || {}); // handy for automation checks in the console

  // ---------- layout ----------
  const ICON_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>';
  const ICON_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';

  function shell(active, body, user) {
    const tab = (key, hash, icon, label) => `<a href="${hash}" class="${active === key ? 'active' : ''}"><span class="ico">${icon}</span>${label}</a>`;
    return `
<div class="brandbar">
  <div class="brand"><span class="logo"></span>${PORTAL_NAME} <small>Provider Portal &middot; Utilization Management</small></div>
  <div class="userbox">Signed in as <strong>${esc(user.displayName)}</strong> (${esc(user.org)}) <a href="#/logout">Sign Out</a></div>
</div>
<nav class="mainnav">
  ${tab('requests', '#/requests', ICON_DOC, "My Organization's Requests")}
  ${tab('create', '#/create', ICON_PEN, 'Create New Request')}
  ${tab('search', '#/search', ICON_SEARCH, 'Search Submitted Requests')}
  ${tab('status', '#/case-status', ICON_SEARCH, 'Check Case Status')}
</nav>
<div class="page">${body}</div>
<footer><span class="sim">SIMULATED PORTAL</span> &mdash; all patients, providers and requests are synthetic test data. &copy; ${new Date().getFullYear()} ${PORTAL_NAME} (fictional).</footer>`;
  }
  function authCard(title, inner) {
    return `<div class="authwrap"><div class="authcard">
  <div class="head"><span class="logo"></span><div><h1>${PORTAL_NAME}</h1><small>Provider Portal &middot; Utilization Management</small></div></div>
  <div class="body"><h2>${title}</h2>${inner}</div></div></div>`;
  }

  // ---------- pages: auth ----------
  function pageLogin(q, error) {
    let notice = '';
    if (q.locked) notice = 'Too many invalid verification attempts. Please sign in again.';
    else if (q.loggedout) notice = 'You have been signed out.';
    render(authCard('Sign In', `
      ${error ? `<div class="alert error" role="alert">${esc(error)}</div>` : ''}
      ${notice ? `<div class="alert info">${esc(notice)}</div>` : ''}
      <form id="loginForm" autocomplete="off">
        <div class="field"><label for="username">User ID</label><input id="username" name="username" type="text" value="${esc(q.username || '')}" required autofocus></div>
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required></div>
        <button class="primary" type="submit" id="signInBtn">Sign In</button>
        <div class="links"><a href="#/login">Forgot User ID or Password?</a><a href="#/login">Register</a></div>
      </form>
      <div class="simbox"><strong>Simulation credentials</strong>
        User IDs <code>jjackson</code>, <code>jnurse</code>, <code>ssmith</code> &mdash; password <code>Password123!</code><br>
        <span class="hint">A verification code will be "sent" on the next screen. A new random dataset is generated for every login.</span></div>`), 'auth');
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim().toLowerCase();
      const password = document.getElementById('password').value;
      const u = USERS[username];
      if (!u || u.password !== password) {
        return pageLogin({ ...q, username }, 'The User ID or Password you entered is incorrect. Please try again.');
      }
      const gen = generateRequests();
      DATA = null;
      try { sessionStorage.removeItem('sim.created'); } catch {}
      const s = { username, displayName: u.displayName, org: u.org, phone: u.phone, mfaVerified: false, dataSeed: gen.seed, next: q.next || '' };
      console.log(`[SIM DATA] Generated ${gen.rows.length} requests for ${username} (seed ${gen.seed})`);
      issueMfaCode(s);
      go('#/mfa');
    });
  }

  function pageMfa(q, error) {
    const s = S.get();
    if (!s) return go('#/login');
    if (s.mfaVerified) return go('#/requests');
    render(authCard('Two-Step Verification', `
      ${error ? `<div class="alert error" role="alert">${esc(error)}</div>` : ''}
      ${q.resent ? '<div class="alert ok">A new verification code has been sent.</div>' : ''}
      <div class="alert info">We sent a 6-digit verification code by text message to <strong>${esc(s.phone)}</strong>. Enter it below to continue. The code expires in 10 minutes.</div>
      <form id="mfaForm" autocomplete="off">
        <div class="field"><label for="code">Verification Code</label><input id="code" name="code" class="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus placeholder="------"></div>
        <button class="primary" type="submit" id="verifyBtn">Verify</button>
      </form>
      <div class="links" style="margin-top:10px"><button type="button" class="btn secondary" id="resendBtn">Resend code</button><a href="#/logout">Cancel and sign out</a></div>
      <div class="simbox" id="simSms"><strong>Simulated SMS to ${esc(s.phone)}</strong>
        Your ${PORTAL_NAME} verification code is:
        <div class="code" id="simCode">${s.mfaCode}</div>
        <span class="hint">In a real portal this would arrive on the user's phone. It is also printed to the browser console.</span></div>`), 'auth');
    document.getElementById('resendBtn').addEventListener('click', () => { issueMfaCode(s); go('#/mfa?resent=1'); pageMfa({ resent: '1' }); });
    document.getElementById('mfaForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const submitted = document.getElementById('code').value.replace(/\D/g, '');
      const expired = Date.now() - (s.mfaIssuedAt || 0) > 10 * 60 * 1000;
      s.mfaAttempts = (s.mfaAttempts || 0) + 1;
      S.set(s);
      if (expired) return pageMfa({}, 'Your verification code has expired. Please request a new code.');
      if (submitted !== s.mfaCode) {
        if (s.mfaAttempts >= 5) { S.clear(); return go('#/login?locked=1'); }
        return pageMfa({}, `The verification code you entered is invalid. ${5 - s.mfaAttempts} attempt(s) remaining.`);
      }
      s.mfaVerified = true;
      const next = s.next && s.next.startsWith('#/') ? s.next : '#/requests';
      delete s.next; delete s.mfaCode;
      S.set(s);
      go(next);
    });
  }

  // ---------- pages: portal ----------
  function pageRequests(q, user) {
    const result = queryRequests(getData(), q);
    const filterKeys = ['status', 'requestType', 'patient', 'trackingId', 'referenceNumber', 'npi'];
    const hasFilters = filterKeys.some((k) => q[k]);
    const qs = (o) => buildHash('requests', { ...q, ...o });
    const sortLink = (col) => qs({ sort: col, dir: result.sort === col && result.dir === 'desc' ? 'asc' : 'desc', page: 1 });
    const arrow = (col) => result.sort === col ? `<span class="sortarrow">${result.dir === 'desc' ? '&#8595;' : '&#8593;'}</span>` : '';
    const th = (col, label, cls) => `<th class="${cls || ''}"><a href="${sortLink(col)}">${label} ${arrow(col)}<span class="caret">&#9660;</span></a></th>`;
    const opt = (list, sel) => list.map((s) => `<option ${sel === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const btn = (cond, hash, id, glyph, title) => cond ? `<a href="${hash}" title="${title}" id="${id}">${glyph}</a>` : `<span class="btn disabled">${glyph}</span>`;

    const rows = result.rows.length ? result.rows.map((r) => `
      <tr data-tracking-id="${r.trackingId}">
        <td><a href="#/requests/${r.trackingId}">${r.trackingId}</a></td>
        <td>${esc(r.referenceNumber)}</td>
        <td><span class="status-pill status-${r.status.replace(/\s+/g, '-')}">${esc(r.status)}</span></td>
        <td class="name">${esc(r.patientName)}</td>
        <td class="nowrap">${r.serviceStart} -<br>${r.serviceEnd}</td>
        <td>${esc(r.requestType)}</td>
        <td>${esc(r.providerNpi)}</td>
        <td class="nowrap">${r.submitDate ? r.submitDate.slice(0, 10) + '<br>' + r.submitDate.slice(11) : ''}</td>
        <td class="by">${esc(r.createdBy)}</td>
        <td class="nowrap">${r.updatedDate.slice(0, 10)}<br>${r.updatedDate.slice(11)}</td>
        <td class="by">${esc(r.updatedBy)}</td>
      </tr>`).join('') : '<tr><td colspan="11" class="empty">No requests match the current filters.</td></tr>';

    render(shell('requests', `
<div class="content">
  <div class="toolbar">
    <div class="pager">
      ${btn(result.page > 1, qs({ page: 1 }), 'pageFirst', '&#9198;', 'First page')}
      ${btn(result.page > 1, qs({ page: result.page - 1 }), 'pagePrev', '&#9664;', 'Previous page')}
      <span class="sep"></span>
      <label for="pageInput">Page</label>
      <input id="pageInput" type="text" value="${result.page}" inputmode="numeric">
      <span>of ${result.totalPages}</span>
      <span class="sep"></span>
      ${btn(result.page < result.totalPages, qs({ page: result.page + 1 }), 'pageNext', '&#9654;', 'Next page')}
      ${btn(result.page < result.totalPages, qs({ page: result.totalPages }), 'pageLast', '&#9197;', 'Last page')}
    </div>
    <div class="viewresults"><span>View Results</span>
      <select id="pageSize">${[10, 20, 50, 100].map((n) => `<option value="${n}" ${result.size === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="summary" id="resultSummary">Displaying ${result.from} to ${result.to} of ${result.total} Requests Found</div>
    <div class="spacer"></div>
    <button type="button" class="iconbtn" title="Filter" id="filterToggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M7 9h10l-4 5v4l-2-1v-3z"/></svg></button>
    <button type="button" class="iconbtn" title="Print" id="printBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg></button>
  </div>
  <form class="filterpanel ${hasFilters ? 'open' : ''}" id="filterPanel">
    <label>Tracking ID <input name="trackingId" value="${esc(q.trackingId || '')}"></label>
    <label>Reference Number <input name="referenceNumber" value="${esc(q.referenceNumber || '')}"></label>
    <label>Status <select name="status"><option value="">All</option>${opt(STATUSES, q.status)}</select></label>
    <label>Patient Name <input name="patient" value="${esc(q.patient || '')}" placeholder="Last, First"></label>
    <label>Request Type <select name="requestType"><option value="">All</option>${opt(REQUEST_TYPES, q.requestType)}</select></label>
    <label>Provider NPI <input name="npi" value="${esc(q.npi || '')}"></label>
    <button type="submit">Apply</button>
    <a class="btn secondary" href="#/requests" style="line-height:26px">Clear</a>
  </form>
  <table class="grid" id="requestsGrid">
    <thead><tr>
      ${th('trackingId', 'Request<br>Tracking ID')}${th('referenceNumber', 'Reference<br>Number')}${th('status', 'Status')}
      ${th('patientName', 'Patient Name')}${th('serviceStart', 'Service Date<br>Range')}${th('requestType', 'Request Type')}
      ${th('providerNpi', 'Requesting<br>Provider NPI')}${th('submitDate', 'Submit Date')}${th('createdBy', 'Created By', 'created')}
      ${th('updatedDate', 'Updated Date')}${th('updatedBy', 'Updated By')}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`, user));

    document.getElementById('pageInput').addEventListener('change', (e) => go(qs({ page: e.target.value })));
    document.getElementById('pageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(qs({ page: e.target.value })); } });
    document.getElementById('pageSize').addEventListener('change', (e) => go(qs({ size: e.target.value, page: 1 })));
    document.getElementById('filterToggle').addEventListener('click', () => document.getElementById('filterPanel').classList.toggle('open'));
    document.getElementById('printBtn').addEventListener('click', () => window.print());
    document.getElementById('filterPanel').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      go(qs({ ...f, page: 1 }));
    });
  }

  function pageDetail(id, user) {
    const row = getData().find((r) => String(r.trackingId) === String(id));
    if (!row) return render(shell('requests', `<div class="content"><h2 class="pagetitle">Request Not Found</h2><p>No request with Tracking ID ${esc(id)} was found.</p><p><a href="#/requests" class="btn secondary">Back to My Organization's Requests</a></p></div>`, user));
    const dl = (pairs) => `<dl>${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v) || '&mdash;'}</dd>`).join('')}</dl>`;
    render(shell('requests', `
<div class="content">
  <div class="breadcrumb"><a href="#/requests">My Organization's Requests</a> &rsaquo; Request Tracking ID ${row.trackingId}</div>
  <h2 class="pagetitle">Request ${row.trackingId} ${row.referenceNumber ? '&middot; ' + esc(row.referenceNumber) : ''} &mdash; <span class="status-${row.status.replace(/\s+/g, '-')}">${esc(row.status)}</span></h2>
  <div class="detailgrid">
    <div class="card"><h3>Request</h3>${dl([['Tracking ID', row.trackingId], ['Reference Number', row.referenceNumber], ['Status', row.status], ['Request Type', row.requestType], ['Service Date Range', row.serviceStart + ' - ' + row.serviceEnd], ['Submit Date', row.submitDate], ['Created By', row.createdBy], ['Updated', row.updatedDate + ' by ' + row.updatedBy]])}</div>
    <div class="card"><h3>Patient</h3>${dl([['Name', row.patientName], ['Member ID', row.memberId], ['Date of Birth', row.dob]])}</div>
    <div class="card"><h3>Clinical / Provider</h3>${dl([['Requesting Provider NPI', row.providerNpi], ['Servicing Facility', row.servicingProvider], ['Service Code', row.serviceCode], ['Units', row.units], ['Primary Diagnosis', row.diagnosis]])}</div>
  </div>
  <p style="margin-top:16px"><a href="#/requests" class="btn secondary">Back to list</a></p>
</div>`, user));
  }

  function pageCreate(user, created) {
    const field = (label, name, extra = '') => `<div class="field"><label>${label}</label><input name="${name}" ${extra}></div>`;
    render(shell('create', `
<div class="content">
  <h2 class="pagetitle">Create New Request</h2>
  ${created ? `<div class="alert ok">Request <strong>${created.trackingId}</strong> ${created.status === 'Submitted' ? 'submitted' : 'saved as Not Submitted'}${created.referenceNumber ? ` with reference number <strong>${created.referenceNumber}</strong>` : ''}. <a href="#/requests/${created.trackingId}">View request</a> &middot; <a href="#/requests">Back to list</a></div>` : ''}
  <form class="card" id="createForm">
    <h3>Patient &amp; Service Information</h3>
    <div class="formgrid">
      ${field('Member ID', 'memberId', 'required')}${field('Patient Last Name', 'lastName', 'required')}${field('Patient First Name', 'firstName', 'required')}
      ${field('Date of Birth', 'dob', 'type="date" required')}
      <div class="field"><label>Request Type</label><select name="requestType">${REQUEST_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></div>
      ${field('Requesting Provider NPI', 'providerNpi', 'pattern="[0-9]{10}" required')}
      ${field('Servicing Facility', 'servicingProvider', `value="${esc(user.org)}"`)}
      ${field('Service Start Date', 'serviceStart', 'type="date" required')}${field('Service End Date', 'serviceEnd', 'type="date"')}
      ${field('Service Code (CPT/HCPCS)', 'serviceCode', 'required')}${field('Units', 'units', 'type="number" min="1" value="1"')}
      ${field('Primary Diagnosis (ICD-10)', 'diagnosis', 'required')}
    </div>
    <div class="actions">
      <button class="btn" type="submit" name="action" value="submit" id="submitRequestBtn">Submit Request</button>
      <button class="btn secondary" type="submit" name="action" value="save" id="saveDraftBtn">Save Without Submitting</button>
    </div>
  </form>
</div>`, user));
    let action = 'submit';
    document.getElementById('submitRequestBtn').addEventListener('click', () => { action = 'submit'; });
    document.getElementById('saveDraftBtn').addEventListener('click', () => { action = 'save'; });
    document.getElementById('createForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(e.target).entries());
      const data = getData();
      const last = data.reduce((m, r) => Math.max(m, r.trackingId), 0);
      const stamp = fmtDateTime(new Date());
      const submit = action === 'submit';
      const row = {
        trackingId: last + 1,
        referenceNumber: submit ? 'UM' + (330000 + data.length) : '',
        status: submit ? 'Submitted' : 'Not Submitted',
        patientName: `${(b.lastName || 'Unknown').trim()}, ${(b.firstName || '').trim()}`.trim(),
        serviceStart: b.serviceStart || '', serviceEnd: b.serviceEnd || b.serviceStart || '',
        requestType: b.requestType || 'Outpatient',
        providerNpi: (b.providerNpi || '').replace(/\D/g, ''),
        submitDate: submit ? stamp : '',
        createdBy: user.displayName, updatedDate: stamp, updatedBy: user.displayName,
        memberId: b.memberId || '', dob: b.dob || '', serviceCode: b.serviceCode || '', diagnosis: b.diagnosis || '',
        units: Number(b.units) || 1, servicingProvider: b.servicingProvider || user.org,
      };
      addCreated(row);
      pageCreate(user, row);
    });
  }

  function pageSearch(q, user) {
    const searched = Object.keys(q).length > 0;
    const result = searched ? queryRequests(getData(), { ...q, size: q.size || 20 }) : null;
    const opt = (list, sel) => list.map((s) => `<option ${sel === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
    render(shell('search', `
<div class="content">
  <h2 class="pagetitle">Search Submitted Requests</h2>
  <form class="filterpanel open" id="searchForm">
    <label>Tracking ID <input name="trackingId" value="${esc(q.trackingId || '')}"></label>
    <label>Reference Number <input name="referenceNumber" value="${esc(q.referenceNumber || '')}"></label>
    <label>Patient Name <input name="patient" value="${esc(q.patient || '')}" placeholder="Last, First"></label>
    <label>Status <select name="status"><option value="">All</option>${opt(STATUSES, q.status)}</select></label>
    <label>Request Type <select name="requestType"><option value="">All</option>${opt(REQUEST_TYPES, q.requestType)}</select></label>
    <label>Provider NPI <input name="npi" value="${esc(q.npi || '')}"></label>
    <button type="submit">Search</button>
  </form>
  ${result ? `
  <p style="margin:10px 0">${result.total} request(s) found${result.total > result.size ? ` (showing first ${result.size})` : ''}.</p>
  <table class="grid"><thead><tr><th>Tracking ID</th><th>Reference Number</th><th>Status</th><th>Patient Name</th><th>Service Date Range</th><th>Request Type</th><th>Provider NPI</th><th>Submit Date</th></tr></thead>
  <tbody>${result.rows.length ? result.rows.map((r) => `<tr><td><a href="#/requests/${r.trackingId}">${r.trackingId}</a></td><td>${esc(r.referenceNumber)}</td><td>${esc(r.status)}</td><td class="name">${esc(r.patientName)}</td><td class="nowrap">${r.serviceStart} - ${r.serviceEnd}</td><td>${esc(r.requestType)}</td><td>${esc(r.providerNpi)}</td><td class="nowrap">${esc(r.submitDate)}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">No matching requests.</td></tr>'}</tbody></table>` : ''}
</div>`, user));
    document.getElementById('searchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      go(buildHash('search', { ...Object.fromEntries(new FormData(e.target).entries()), searched: 1 }));
    });
  }

  function pageCaseStatus(q, user) {
    const ref = (q.referenceNumber || '').trim().toUpperCase();
    const row = ref ? getData().find((r) => r.referenceNumber === ref) : null;
    render(shell('status', `
<div class="content">
  <h2 class="pagetitle">Check Case Status</h2>
  <form class="filterpanel open" id="caseStatusForm">
    <label>Reference Number <input name="referenceNumber" value="${esc(ref)}" placeholder="UM123456" required></label>
    <button type="submit">Check Status</button>
  </form>
  ${ref && !row ? `<div class="alert error" style="margin-top:12px">No case found with reference number <strong>${esc(ref)}</strong>.</div>` : ''}
  ${row ? `<div class="card" style="margin-top:12px;max-width:520px"><h3>Case ${esc(row.referenceNumber)}</h3><dl>
      <dt>Status</dt><dd>${esc(row.status)}</dd><dt>Tracking ID</dt><dd><a href="#/requests/${row.trackingId}">${row.trackingId}</a></dd>
      <dt>Patient</dt><dd>${esc(row.patientName)}</dd><dt>Service Dates</dt><dd>${row.serviceStart} - ${row.serviceEnd}</dd>
      <dt>Request Type</dt><dd>${esc(row.requestType)}</dd><dt>Last Updated</dt><dd>${row.updatedDate} by ${esc(row.updatedBy)}</dd></dl></div>` : ''}
</div>`, user));
    document.getElementById('caseStatusForm').addEventListener('submit', (e) => {
      e.preventDefault();
      go(buildHash('case-status', Object.fromEntries(new FormData(e.target).entries())));
    });
  }

  // ---------- router ----------
  function route() {
    const { path, query } = parseRoute();
    const s = S.get();
    if (path === 'logout') { S.clear(); DATA = null; return go('#/login?loggedout=1'); }
    if (path === 'login') { if (s && s.mfaVerified) return go('#/requests'); return pageLogin(query); }
    if (path === 'mfa') return pageMfa(query);
    // everything else requires a verified session
    if (!s) { return go(buildHash('login', { next: '#/' + path })); }
    if (!s.mfaVerified) return go('#/mfa');
    const user = s;
    if (path === '' || path === 'requests') return pageRequests(query, user);
    const m = path.match(/^requests\/(\d+)$/);
    if (m) return pageDetail(m[1], user);
    if (path === 'create') return pageCreate(user, null);
    if (path === 'search') return pageSearch(query, user);
    if (path === 'case-status') return pageCaseStatus(query, user);
    return go('#/requests');
  }
  window.addEventListener('hashchange', route);
  route();
})();
