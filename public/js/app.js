/* ── State ─────────────────────────────────────────────────────────────── */
const state = {
  view: 'dashboard',
  contacts: { data: [], total: 0, offset: 0, limit: 50, cursors: [], search: '' },
  companies: { data: [], total: 0, offset: 0, limit: 50, cursors: [], search: '' },
  deals: { data: [], total: 0 },
  tasks: { data: [], total: 0 },
  stats: {},
};

/* ── Helpers ──────────────────────────────────────────────────────────── */
function fmt(val, fallback = '–') {
  return val || fallback;
}

function fmtMoney(n, currency = 'USD') {
  if (!n && n !== 0) return '–';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtNum(n) {
  if (!n) return '–';
  return new Intl.NumberFormat('en-US').format(n);
}

function initials(name) {
  if (!name) return '?';
  const parts = name.split(' ').filter(Boolean);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

function lifecycleBadge(lc) {
  const map = {
    lead: 'badge-lead',
    customer: 'badge-customer',
    subscriber: 'badge-subscriber',
    marketingqualifiedlead: 'badge-marketingqualifiedlead',
    salesqualifiedlead: 'badge-salesqualifiedlead',
    opportunity: 'badge-opportunity',
  };
  const cls = map[lc] || 'badge-default';
  const label = lc ? lc.replace('qualifiedlead', ' QL').replace('qualifiedtobuy', 'Qual') : 'Unknown';
  return `<span class="badge ${cls}">${label}</span>`;
}

function stageBadge(stage) {
  const labels = {
    closedwon: { label: 'Closed Won', cls: 'badge-won', color: '#38a169' },
    closedlost: { label: 'Closed Lost', cls: 'badge-lost', color: '#e53e3e' },
    appointmentscheduled: { label: 'Appt Scheduled', color: '#3182ce' },
    qualifiedtobuy: { label: 'Qualified', color: '#805ad5' },
    presentationscheduled: { label: 'Presentation', color: '#d69e2e' },
    decisionmakerboughtin: { label: 'Decision Maker', color: '#2c7a7b' },
    contractsent: { label: 'Contract Sent', color: '#dd6b20' },
  };
  const info = labels[stage] || { label: stage || 'Unknown', color: '#718096' };
  return `<span class="stage-pill" style="background:${info.color}22;color:${info.color}">${info.label || info.cls}</span>`;
}

function industryLabel(ind) {
  if (!ind) return '–';
  return ind.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

async function api(path) {
  try {
    const res = await fetch(path);
    const data = await res.json();
    if (data.error) {
      if (data.error.toLowerCase().includes('token') || data.error.includes('401')) {
        document.getElementById('no-token-banner').style.display = 'flex';
      }
      throw new Error(data.error);
    }
    document.getElementById('no-token-banner').style.display = 'none';
    return data;
  } catch (err) {
    toast(err.message || 'API error', 'error');
    throw err;
  }
}

async function apiPost(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    toast(err.message || 'API error', 'error');
    throw err;
  }
}

/* ── Toast ────────────────────────────────────────────────────────────── */
function toast(msg, type = 'info') {
  const container = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ── Navigation ───────────────────────────────────────────────────────── */
const viewTitles = {
  dashboard: ['Dashboard', 'Overview of your CRM'],
  contacts: ['Contacts', 'Manage your people'],
  deals: ['Deals', 'Track your pipeline'],
  companies: ['Companies', 'Your organizations'],
  tasks: ['Tasks', 'Open items to action'],
};

function navigate(view) {
  state.view = view;

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(el => {
    el.classList.toggle('active', el.id === `view-${view}`);
  });

  const [title, sub] = viewTitles[view] || [view, ''];
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-subtitle').textContent = sub;

  if (view === 'contacts' && state.contacts.data.length === 0) loadContacts();
  if (view === 'deals' && state.deals.data.length === 0) loadDeals();
  if (view === 'companies' && state.companies.data.length === 0) loadCompanies();
  if (view === 'tasks' && state.tasks.data.length === 0) loadTasks();
}

/* ── Stats ────────────────────────────────────────────────────────────── */
async function loadStats() {
  try {
    const s = await api('/api/stats');
    state.stats = s;
    document.getElementById('stat-contacts').textContent = fmtNum(s.contacts);
    document.getElementById('stat-companies').textContent = fmtNum(s.companies);
    document.getElementById('stat-open-deals').textContent = fmtNum(s.openDeals);
    document.getElementById('stat-won-value').textContent = fmtMoney(s.wonValue);

    document.getElementById('nav-contacts-count').textContent = fmtNum(s.contacts);
    document.getElementById('nav-deals-count').textContent = fmtNum(s.deals);
    document.getElementById('nav-companies-count').textContent = fmtNum(s.companies);
  } catch (_) {}
}

/* ── Dashboard contacts ───────────────────────────────────────────────── */
async function loadDashContacts() {
  try {
    const d = await api('/api/contacts?limit=6');
    const tbody = document.getElementById('dash-contacts-body');
    if (!d.results.length) {
      tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><p>No contacts yet.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = d.results.map(c => `
      <tr>
        <td>
          <div class="name-cell">
            <div class="contact-avatar">${initials(c.name)}</div>
            <a class="table-link" href="https://app-na2.hubspot.com/contacts/246270512/record/0-1/${c.id}" target="_blank">${fmt(c.name)}</a>
          </div>
        </td>
        <td style="color:var(--text-muted)">${fmt(c.email)}</td>
        <td>${lifecycleBadge(c.lifecycle)}</td>
      </tr>`).join('');
  } catch (_) {}
}

/* ── Dashboard deals ──────────────────────────────────────────────────── */
async function loadDashDeals() {
  try {
    const d = await api('/api/deals?limit=10');
    const tbody = document.getElementById('dash-deals-body');
    if (!d.results.length) {
      tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><p>No deals yet.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = d.results.map(deal => `
      <tr>
        <td>
          <a class="table-link" href="https://app-na2.hubspot.com/contacts/246270512/record/0-3/${deal.id}" target="_blank">${fmt(deal.name)}</a>
        </td>
        <td style="font-weight:700;color:var(--hs-orange)">${fmtMoney(deal.amount, deal.currency)}</td>
        <td>${stageBadge(deal.stage)}</td>
      </tr>`).join('');
  } catch (_) {}
}

/* ── Dashboard companies ──────────────────────────────────────────────── */
async function loadDashCompanies() {
  try {
    const d = await api('/api/companies?limit=8');
    const tbody = document.getElementById('dash-companies-body');
    if (!d.results.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>No companies yet.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = d.results.map(c => `
      <tr>
        <td>
          <div class="name-cell">
            <div class="company-avatar">${(c.name || '?')[0].toUpperCase()}</div>
            <a class="table-link" href="https://app-na2.hubspot.com/contacts/246270512/record/0-2/${c.id}" target="_blank">${fmt(c.name)}</a>
          </div>
        </td>
        <td>${c.industry ? `<span class="industry-tag">${industryLabel(c.industry)}</span>` : '–'}</td>
        <td style="color:var(--text-muted)">${[c.city, c.state].filter(Boolean).join(', ') || '–'}</td>
        <td style="color:var(--text-muted)">${fmtNum(c.employees)}</td>
        <td>${lifecycleBadge(c.lifecycle)}</td>
      </tr>`).join('');
  } catch (_) {}
}

/* ── Contacts page ────────────────────────────────────────────────────── */
async function loadContacts(reset = false) {
  if (reset) {
    state.contacts.offset = 0;
    state.contacts.cursors = [];
  }
  const { limit, offset, search } = state.contacts;
  const url = `/api/contacts?limit=${limit}&offset=${offset}${search ? '&search=' + encodeURIComponent(search) : ''}`;
  const tbody = document.getElementById('contacts-body');
  tbody.innerHTML = `<tr><td colspan="6"><div class="loading"><div class="spinner"></div> Loading...</div></td></tr>`;
  try {
    const d = await api(url);
    state.contacts.data = d.results;
    state.contacts.total = d.total;
    document.getElementById('contacts-total-label').textContent = `(${fmtNum(d.total)} total)`;

    if (!d.results.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <h3>No contacts found</h3><p>Try a different search term.</p></div></td></tr>`;
    } else {
      tbody.innerHTML = d.results.map(c => `
        <tr>
          <td>
            <div class="name-cell">
              <div class="contact-avatar">${initials(c.name)}</div>
              <a class="table-link" href="https://app-na2.hubspot.com/contacts/246270512/record/0-1/${c.id}" target="_blank">${fmt(c.name)}</a>
            </div>
          </td>
          <td style="color:var(--text-muted)">${fmt(c.email)}</td>
          <td style="color:var(--text-muted)">${fmt(c.phone)}</td>
          <td>${fmt(c.company)}</td>
          <td>${lifecycleBadge(c.lifecycle)}</td>
          <td style="color:var(--text-muted);white-space:nowrap">${fmtDate(c.createdAt)}</td>
        </tr>`).join('');
    }

    const start = offset + 1;
    const end = Math.min(offset + d.results.length, d.total);
    document.getElementById('contacts-page-info').textContent = d.total ? `Showing ${start}–${end} of ${fmtNum(d.total)}` : '0 results';
    document.getElementById('contacts-prev').disabled = offset === 0;
    document.getElementById('contacts-next').disabled = end >= d.total;
  } catch (_) {}
}

function contactsPage(dir) {
  state.contacts.offset = Math.max(0, state.contacts.offset + dir * state.contacts.limit);
  loadContacts();
}

let contactsSearchTimer;
document.getElementById('contacts-search').addEventListener('input', e => {
  clearTimeout(contactsSearchTimer);
  state.contacts.search = e.target.value.trim();
  contactsSearchTimer = setTimeout(() => loadContacts(true), 400);
});

/* ── Deals page ───────────────────────────────────────────────────────── */
async function loadDeals() {
  const board = document.getElementById('pipeline-board');
  const tbody = document.getElementById('deals-body');
  board.innerHTML = `<div class="loading" style="width:100%"><div class="spinner"></div> Loading deals...</div>`;
  tbody.innerHTML = `<tr><td colspan="5"><div class="loading"><div class="spinner"></div> Loading...</div></td></tr>`;

  try {
    const d = await api('/api/deals?limit=100');
    state.deals.data = d.results;
    state.deals.total = d.total;
    document.getElementById('deals-total-label').textContent = `(${fmtNum(d.total)} total)`;

    // Pipeline board
    const stageOrder = [
      'appointmentscheduled', 'qualifiedtobuy', 'presentationscheduled',
      'decisionmakerboughtin', 'contractsent', 'closedwon', 'closedlost',
    ];
    const stageLabels = {
      appointmentscheduled: 'Appt Scheduled',
      qualifiedtobuy: 'Qualified',
      presentationscheduled: 'Presentation',
      decisionmakerboughtin: 'Decision Maker',
      contractsent: 'Contract Sent',
      closedwon: 'Closed Won',
      closedlost: 'Closed Lost',
    };

    const byStage = {};
    d.results.forEach(deal => {
      const s = deal.stage || 'unknown';
      if (!byStage[s]) byStage[s] = [];
      byStage[s].push(deal);
    });

    // Add any stages not in order
    const allStages = [...new Set([...stageOrder, ...Object.keys(byStage)])].filter(s => byStage[s]);
    if (!allStages.length) {
      board.innerHTML = `<div class="empty-state" style="width:100%">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        <h3>No deals yet</h3><p>Create your first deal to start tracking your pipeline.</p></div>`;
    } else {
      board.innerHTML = allStages.map(stage => {
        const deals = byStage[stage] || [];
        const total = deals.reduce((s, d) => s + d.amount, 0);
        return `
          <div class="pipeline-col">
            <div class="pipeline-col-header">
              <span class="pipeline-col-name">${stageLabels[stage] || stage}</span>
              <span class="pipeline-col-count">${deals.length}</span>
            </div>
            ${deals.map(deal => `
              <div class="deal-card">
                <div class="deal-card-name">${fmt(deal.name)}</div>
                <div class="deal-card-amount">${fmtMoney(deal.amount, deal.currency)}</div>
                <div class="deal-card-meta">
                  <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  ${fmtDate(deal.closeDate)}
                </div>
              </div>`).join('')}
            ${deals.length ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right">Total: ${fmtMoney(total)}</div>` : ''}
          </div>`;
      }).join('');
    }

    // Table
    if (!d.results.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>No deals found.</p></div></td></tr>`;
    } else {
      tbody.innerHTML = d.results.map(deal => {
        const prob = Math.round(deal.probability * 100);
        return `
          <tr>
            <td><a class="table-link" href="https://app-na2.hubspot.com/contacts/246270512/record/0-3/${deal.id}" target="_blank">${fmt(deal.name)}</a></td>
            <td style="font-weight:700;color:var(--hs-orange)">${fmtMoney(deal.amount, deal.currency)}</td>
            <td>${stageBadge(deal.stage)}</td>
            <td style="color:var(--text-muted);white-space:nowrap">${fmtDate(deal.closeDate)}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <div class="progress-bar"><div class="progress-fill" style="width:${prob}%"></div></div>
                <span style="font-size:12px;color:var(--text-muted)">${prob}%</span>
              </div>
            </td>
          </tr>`;
      }).join('');
    }
  } catch (_) {}
}

/* ── Companies page ───────────────────────────────────────────────────── */
async function loadCompanies(reset = false) {
  if (reset) { state.companies.offset = 0; }
  const { limit, offset, search } = state.companies;
  const url = `/api/companies?limit=${limit}&offset=${offset}${search ? '&search=' + encodeURIComponent(search) : ''}`;
  const tbody = document.getElementById('companies-body');
  tbody.innerHTML = `<tr><td colspan="6"><div class="loading"><div class="spinner"></div> Loading...</div></td></tr>`;
  try {
    const d = await api(url);
    state.companies.data = d.results;
    state.companies.total = d.total;
    document.getElementById('companies-total-label').textContent = `(${fmtNum(d.total)} total)`;

    if (!d.results.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M3 21h18M3 7l9-4 9 4M4 21V9m16 12V9M9 21V9m6 12V9"/></svg>
        <h3>No companies found</h3><p>Try a different search term.</p></div></td></tr>`;
    } else {
      tbody.innerHTML = d.results.map(c => `
        <tr>
          <td>
            <div class="name-cell">
              <div class="company-avatar">${(c.name || '?')[0].toUpperCase()}</div>
              <a class="table-link" href="https://app-na2.hubspot.com/contacts/246270512/record/0-2/${c.id}" target="_blank">${fmt(c.name)}</a>
            </div>
          </td>
          <td>${c.industry ? `<span class="industry-tag">${industryLabel(c.industry)}</span>` : '–'}</td>
          <td style="color:var(--text-muted)">${[c.city, c.state].filter(Boolean).join(', ') || '–'}</td>
          <td style="color:var(--text-muted)">${fmtNum(c.employees)}</td>
          <td>${c.domain ? `<a class="table-link" href="https://${c.domain}" target="_blank">${c.domain}</a>` : '–'}</td>
          <td>${lifecycleBadge(c.lifecycle)}</td>
        </tr>`).join('');
    }

    const start = offset + 1;
    const end = Math.min(offset + d.results.length, d.total);
    document.getElementById('companies-page-info').textContent = d.total ? `Showing ${start}–${end} of ${fmtNum(d.total)}` : '0 results';
    document.getElementById('companies-prev').disabled = offset === 0;
    document.getElementById('companies-next').disabled = end >= d.total;
  } catch (_) {}
}

function companiesPage(dir) {
  state.companies.offset = Math.max(0, state.companies.offset + dir * state.companies.limit);
  loadCompanies();
}

let companiesSearchTimer;
document.getElementById('companies-search').addEventListener('input', e => {
  clearTimeout(companiesSearchTimer);
  state.companies.search = e.target.value.trim();
  companiesSearchTimer = setTimeout(() => loadCompanies(true), 400);
});

/* ── Tasks page ───────────────────────────────────────────────────────── */
async function loadTasks() {
  const tbody = document.getElementById('tasks-body');
  tbody.innerHTML = `<tr><td colspan="5"><div class="loading"><div class="spinner"></div> Loading...</div></td></tr>`;
  try {
    const d = await api('/api/tasks');
    state.tasks.data = d.results;
    if (!d.results.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
        <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <h3>No open tasks</h3><p>You're all caught up!</p></div></td></tr>`;
    } else {
      const prioColor = { HIGH: 'var(--danger)', MEDIUM: 'var(--warning)', LOW: 'var(--info)' };
      tbody.innerHTML = d.results.map(t => `
        <tr>
          <td><strong>${fmt(t.subject, 'Untitled task')}</strong></td>
          <td style="color:var(--text-muted)">${fmt(t.type)}</td>
          <td><span style="color:${prioColor[t.priority] || 'var(--text-muted)'}; font-weight:600">${fmt(t.priority)}</span></td>
          <td style="color:var(--text-muted);white-space:nowrap">${fmtDate(t.dueDate)}</td>
          <td>${lifecycleBadge(t.status?.toLowerCase())}</td>
        </tr>`).join('');
    }
  } catch (_) {}
}

/* ── Modals ───────────────────────────────────────────────────────────── */
function openNewModal() {
  const view = state.view;
  if (view === 'contacts') openNewContactModal();
  else if (view === 'deals') openNewDealModal();
  else openNewContactModal();
}

function openNewContactModal() { document.getElementById('modal-contact').classList.add('open'); }
function openNewDealModal() { document.getElementById('modal-deal').classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
});

async function submitContact() {
  const body = {
    firstname: document.getElementById('cf-firstname').value.trim(),
    lastname: document.getElementById('cf-lastname').value.trim(),
    email: document.getElementById('cf-email').value.trim(),
    phone: document.getElementById('cf-phone').value.trim(),
    company: document.getElementById('cf-company').value.trim(),
  };
  if (!body.email) { toast('Email is required', 'error'); return; }
  try {
    await apiPost('/api/contacts', body);
    toast('Contact created successfully!', 'success');
    closeModal('modal-contact');
    ['cf-firstname','cf-lastname','cf-email','cf-phone','cf-company'].forEach(id => document.getElementById(id).value = '');
    await loadStats();
    if (state.view === 'contacts') loadContacts(true);
    else loadDashContacts();
  } catch (_) {}
}

async function submitDeal() {
  const body = {
    dealname: document.getElementById('df-name').value.trim(),
    amount: document.getElementById('df-amount').value,
    dealstage: document.getElementById('df-stage').value,
    closedate: document.getElementById('df-closedate').value,
  };
  if (!body.dealname) { toast('Deal name is required', 'error'); return; }
  try {
    await apiPost('/api/deals', body);
    toast('Deal created successfully!', 'success');
    closeModal('modal-deal');
    ['df-name','df-amount','df-closedate'].forEach(id => document.getElementById(id).value = '');
    await loadStats();
    if (state.view === 'deals') loadDeals();
    else loadDashDeals();
  } catch (_) {}
}

/* ── Global search shortcut ──────────────────────────────────────────── */
document.getElementById('global-search').addEventListener('input', e => {
  const q = e.target.value.trim();
  if (!q) return;
  if (state.view === 'contacts') {
    state.contacts.search = q;
    document.getElementById('contacts-search').value = q;
    loadContacts(true);
  } else if (state.view === 'companies') {
    state.companies.search = q;
    document.getElementById('companies-search').value = q;
    loadCompanies(true);
  }
});

/* ── Init ─────────────────────────────────────────────────────────────── */
(async function init() {
  // Check token status
  try {
    const health = await fetch('/api/health');
    const h = await health.json();
    if (h.token === 'missing') document.getElementById('no-token-banner').style.display = 'flex';
  } catch (_) {}

  await Promise.all([
    loadStats(),
    loadDashContacts(),
    loadDashDeals(),
    loadDashCompanies(),
  ]);
})();
