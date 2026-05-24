/* ── Nav scroll effect ────────────────────────────────────────────────────── */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

/* ── Mobile menu ──────────────────────────────────────────────────────────── */
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');
navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));

/* ── Toast ────────────────────────────────────────────────────────────────── */
function toast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtPrice(n, currency = 'USD') {
  if (!n && n !== 0) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

/* ── Property images (cycling placeholder photos) ────────────────────────── */
const PROPERTY_IMGS = [
  'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=680&q=75',
  'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=680&q=75',
  'https://images.unsplash.com/photo-1600047509358-9dc75507daeb?w=680&q=75',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=680&q=75',
  'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=680&q=75',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=680&q=75',
];

/* ── Listings ─────────────────────────────────────────────────────────────── */
let allListings = [];
let activeFilter = 'all';

function statusClass(status) {
  if (status === 'For Sale') return 'status-for-sale';
  if (status === 'Sold') return 'status-sold';
  return 'status-off-market';
}

function buildCard(listing, imgIndex) {
  const img = PROPERTY_IMGS[imgIndex % PROPERTY_IMGS.length];
  const price = fmtPrice(listing.price, listing.currency);
  const statusCls = statusClass(listing.status);
  const addressParts = listing.address.split(/,?\s+/).slice(0, 6).join(' ');

  return `
    <article class="property-card" data-status="${listing.status}" itemscope itemtype="https://schema.org/RealEstateListing">
      <div class="property-img">
        <img
          src="${img}"
          alt="Property at ${listing.address}"
          loading="lazy"
          itemprop="image"
          onerror="this.parentElement.innerHTML='<div class=\\'property-img-placeholder\\'>🏠</div>'"
        />
        <span class="property-status ${statusCls}">${listing.status}</span>
      </div>
      <div class="property-body">
        <div class="property-price" itemprop="price">
          ${price ? price : '<span class="property-price-na">Contact for Price</span>'}
        </div>
        <div class="property-address" itemprop="address">${addressParts}</div>
        <div class="property-meta">
          <span class="property-meta-item">📍 Mississippi Gulf Coast</span>
          ${listing.closeDate && listing.status === 'Sold' ? `<span class="property-meta-item">✓ Sold ${new Date(listing.closeDate).toLocaleDateString('en-US', {month:'short',year:'numeric'})}</span>` : ''}
        </div>
        <div class="property-actions">
          <button class="property-btn property-btn-primary" onclick="inquireProperty('${listing.address.replace(/'/g,"\\'")}')">Inquire</button>
          <a class="property-btn property-btn-secondary" href="${listing.hubspotUrl}" target="_blank" rel="noopener">Details</a>
        </div>
      </div>
    </article>`;
}

function renderListings() {
  const grid = document.getElementById('listings-grid');
  const empty = document.getElementById('listings-empty');
  const filtered = activeFilter === 'all'
    ? allListings
    : allListings.filter(l => l.status === activeFilter);

  if (!filtered.length) {
    grid.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  empty.style.display = 'none';
  grid.innerHTML = filtered.map((l, i) => buildCard(l, i)).join('');
}

async function loadListings() {
  const grid = document.getElementById('listings-grid');
  try {
    const res = await fetch('/api/listings');
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    allListings = data.listings || [];

    if (!allListings.length) {
      grid.innerHTML = `
        <div class="listings-loading">
          <p style="color:var(--gray)">No listings on file yet — check back soon!</p>
        </div>`;
      return;
    }

    renderListings();
  } catch (err) {
    grid.innerHTML = `<div class="listings-loading"><p>Listings temporarily unavailable.</p></div>`;
  }
}

/* Listing tabs */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    renderListings();
  });
});

/* Property inquiry shortcut — pre-fills and scrolls to buyer form */
function inquireProperty(address) {
  const msg = document.getElementById('b-message');
  if (msg) msg.value = `I'm interested in the property at: ${address}`;
  document.getElementById('buy').scrollIntoView({ behavior: 'smooth' });
}

/* ── Lead Form Submission ─────────────────────────────────────────────────── */
async function submitLead(form) {
  const data = new FormData(form);
  const body = {
    leadType: form.dataset.leadType || 'General',
    firstname: data.get('firstname') || '',
    lastname: data.get('lastname') || '',
    email: data.get('email') || '',
    phone: data.get('phone') || '',
    message: data.get('message') || '',
    budget: data.get('budget') || '',
    timeline: data.get('timeline') || '',
    propertyAddress: data.get('propertyAddress') || '',
  };

  if (!body.email) { toast('Please enter your email address.', 'error'); return false; }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();

    if (!res.ok || result.error) {
      throw new Error(result.error || 'Something went wrong');
    }

    toast(`Thank you, ${body.firstname || 'there'}! Austin will be in touch shortly.`);
    form.reset();

    // Fire GA4 conversion event if available
    if (typeof gtag !== 'undefined') {
      gtag('event', 'generate_lead', { event_category: body.leadType, event_label: body.email });
    }

    return true;
  } catch (err) {
    toast(err.message || 'Submission failed. Please try again.', 'error');
    return false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

['buyer-form', 'seller-form', 'contact-form'].forEach(id => {
  const form = document.getElementById(id);
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    await submitLead(form);
  });
});

/* ── Init ────────────────────────────────────────────────────────────────── */
loadListings();
