require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HS_BASE = 'https://api.hubapi.com';
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function hsHeaders() {
  return { Authorization: `Bearer ${HS_TOKEN}`, 'Content-Type': 'application/json' };
}

async function hsPost(endpoint, body) {
  const res = await fetch(`${HS_BASE}${endpoint}`, {
    method: 'POST',
    headers: hsHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HubSpot error ${res.status}`);
  return data;
}

// ── Listings from HubSpot Deals ───────────────────────────────────────────────
app.get('/api/listings', async (req, res) => {
  try {
    const body = {
      limit: 100,
      properties: ['dealname', 'amount', 'dealstage', 'closedate', 'deal_currency_code', 'description', 'createdate'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      filterGroups: [],
    };
    const data = await hsPost('/crm/v3/objects/deals/search', body);
    const listings = data.results.map(d => {
      const stage = d.properties.dealstage;
      let status = 'For Sale';
      if (stage === 'closedwon') status = 'Sold';
      else if (stage === 'closedlost') status = 'Off Market';
      return {
        id: d.id,
        address: d.properties.dealname,
        price: d.properties.amount ? parseFloat(d.properties.amount) : null,
        currency: d.properties.deal_currency_code || 'USD',
        status,
        closeDate: d.properties.closedate,
        description: d.properties.description,
        createdAt: d.properties.createdate,
        hubspotUrl: `https://app-na2.hubspot.com/contacts/246270512/record/0-3/${d.id}`,
      };
    });
    res.json({ listings, total: listings.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Lead Capture → HubSpot Contact + Note ────────────────────────────────────
app.post('/api/lead', async (req, res) => {
  try {
    const { firstname, lastname, email, phone, leadType, message, budget, timeline, propertyAddress } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const contactProps = {
      firstname: firstname || '',
      lastname: lastname || '',
      email,
      phone: phone || '',
      lifecyclestage: 'lead',
      hs_lead_status: 'NEW',
      lead_type: leadType || 'General',
    };

    // Create or update contact
    const contact = await hsPost('/crm/v3/objects/contacts', { properties: contactProps })
      .catch(async err => {
        if (err.message.includes('CONTACT_EXISTS')) {
          const existing = await fetch(
            `${HS_BASE}/crm/v3/objects/contacts/${email}?idProperty=email`,
            { headers: hsHeaders() }
          ).then(r => r.json());
          return existing;
        }
        throw err;
      });

    // Create a note with full lead details
    const noteLines = [
      `Lead Type: ${leadType || 'General Inquiry'}`,
      message ? `Message: ${message}` : null,
      budget ? `Budget: ${budget}` : null,
      timeline ? `Timeline: ${timeline}` : null,
      propertyAddress ? `Property Address: ${propertyAddress}` : null,
      `Source: Website`,
    ].filter(Boolean);

    const note = await hsPost('/crm/v3/objects/notes', {
      properties: {
        hs_note_body: noteLines.join('\n'),
        hs_timestamp: Date.now().toString(),
      },
    });

    // Associate note with contact
    if (contact.id && note.id) {
      await fetch(
        `${HS_BASE}/crm/v3/objects/notes/${note.id}/associations/contacts/${contact.id}/202`,
        { method: 'PUT', headers: hsHeaders() }
      );
    }

    res.json({ success: true, contactId: contact.id });
  } catch (err) {
    console.error('Lead error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Sitemap ───────────────────────────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  res.header('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${SITE_URL}/#listings</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${SITE_URL}/#buy</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE_URL}/#sell</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${SITE_URL}/#about</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
</urlset>`);
});

// ── Robots ────────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml`);
});

app.listen(PORT, () => {
  console.log(`Austin Walker Real Estate site → http://localhost:${PORT}`);
  if (!HS_TOKEN) console.warn('⚠  HUBSPOT_ACCESS_TOKEN not set – set it in .env');
});
