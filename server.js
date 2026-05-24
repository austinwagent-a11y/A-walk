require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const HS_BASE = 'https://api.hubapi.com';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function hsHeaders() {
  return {
    Authorization: `Bearer ${HS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function hsGet(path, params = {}) {
  const url = new URL(`${HS_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: hsHeaders() });
  if (!res.ok) throw new Error(`HubSpot API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function hsPost(path, body) {
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'POST',
    headers: hsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Contacts ──────────────────────────────────────────────────────────────────
app.get('/api/contacts', async (req, res) => {
  try {
    const { search = '', limit = 50, after = '' } = req.query;
    const body = {
      limit: parseInt(limit),
      properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'lifecyclestage', 'hs_lead_status', 'createdate'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      filterGroups: search
        ? [{
            filters: [
              { propertyName: 'email', operator: 'CONTAINS_TOKEN', value: search },
            ],
          }]
        : [],
    };
    if (after) body.after = after;
    const data = await hsPost('/crm/v3/objects/contacts/search', body);
    res.json({
      results: data.results.map(c => ({
        id: c.id,
        name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || c.properties.email,
        email: c.properties.email,
        phone: c.properties.phone,
        company: c.properties.company,
        lifecycle: c.properties.lifecyclestage,
        leadStatus: c.properties.hs_lead_status,
        createdAt: c.properties.createdate,
      })),
      total: data.total,
      paging: data.paging,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Deals ─────────────────────────────────────────────────────────────────────
app.get('/api/deals', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const body = {
      limit: parseInt(limit),
      properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'deal_currency_code', 'hs_deal_stage_probability', 'createdate'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      filterGroups: [],
    };
    const data = await hsPost('/crm/v3/objects/deals/search', body);
    res.json({
      results: data.results.map(d => ({
        id: d.id,
        name: d.properties.dealname,
        amount: parseFloat(d.properties.amount || 0),
        currency: d.properties.deal_currency_code || 'USD',
        stage: d.properties.dealstage,
        pipeline: d.properties.pipeline,
        probability: parseFloat(d.properties.hs_deal_stage_probability || 0),
        closeDate: d.properties.closedate,
        createdAt: d.properties.createdate,
      })),
      total: data.total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Companies ────────────────────────────────────────────────────────────────
app.get('/api/companies', async (req, res) => {
  try {
    const { search = '', limit = 50, after = '' } = req.query;
    const body = {
      limit: parseInt(limit),
      properties: ['name', 'domain', 'industry', 'city', 'state', 'numberofemployees', 'annualrevenue', 'lifecyclestage', 'createdate'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      filterGroups: search
        ? [{ filters: [{ propertyName: 'name', operator: 'CONTAINS_TOKEN', value: search }] }]
        : [],
    };
    if (after) body.after = after;
    const data = await hsPost('/crm/v3/objects/companies/search', body);
    res.json({
      results: data.results.map(c => ({
        id: c.id,
        name: c.properties.name || c.properties.domain || 'Unknown',
        domain: c.properties.domain,
        industry: c.properties.industry,
        city: c.properties.city,
        state: c.properties.state,
        employees: c.properties.numberofemployees,
        revenue: c.properties.annualrevenue,
        lifecycle: c.properties.lifecyclestage,
        createdAt: c.properties.createdate,
      })),
      total: data.total,
      paging: data.paging,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [contacts, deals, companies] = await Promise.all([
      hsPost('/crm/v3/objects/contacts/search', { limit: 1, filterGroups: [] }),
      hsPost('/crm/v3/objects/deals/search', {
        limit: 100,
        properties: ['amount', 'dealstage', 'deal_currency_code'],
        filterGroups: [],
      }),
      hsPost('/crm/v3/objects/companies/search', { limit: 1, filterGroups: [] }),
    ]);

    const totalDealsValue = deals.results.reduce((sum, d) => sum + parseFloat(d.properties.amount || 0), 0);
    const openDeals = deals.results.filter(d => d.properties.dealstage !== 'closedwon' && d.properties.dealstage !== 'closedlost').length;
    const wonDeals = deals.results.filter(d => d.properties.dealstage === 'closedwon').length;
    const wonValue = deals.results
      .filter(d => d.properties.dealstage === 'closedwon')
      .reduce((sum, d) => sum + parseFloat(d.properties.amount || 0), 0);

    res.json({
      contacts: contacts.total,
      companies: companies.total,
      deals: deals.total,
      openDeals,
      wonDeals,
      totalDealsValue,
      wonValue,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get('/api/tasks', async (req, res) => {
  try {
    const body = {
      limit: 20,
      properties: ['hs_task_subject', 'hs_task_status', 'hs_task_priority', 'hs_due_date', 'hs_task_type', 'createdate'],
      sorts: [{ propertyName: 'hs_due_date', direction: 'ASCENDING' }],
      filterGroups: [{ filters: [{ propertyName: 'hs_task_status', operator: 'NEQ', value: 'COMPLETED' }] }],
    };
    const data = await hsPost('/crm/v3/objects/tasks/search', body);
    res.json({
      results: data.results.map(t => ({
        id: t.id,
        subject: t.properties.hs_task_subject,
        status: t.properties.hs_task_status,
        priority: t.properties.hs_task_priority,
        dueDate: t.properties.hs_due_date,
        type: t.properties.hs_task_type,
      })),
      total: data.total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create Contact ────────────────────────────────────────────────────────────
app.post('/api/contacts', async (req, res) => {
  try {
    const { firstname, lastname, email, phone, company } = req.body;
    const data = await fetch(`${HS_BASE}/crm/v3/objects/contacts`, {
      method: 'POST',
      headers: hsHeaders(),
      body: JSON.stringify({ properties: { firstname, lastname, email, phone, company } }),
    });
    if (!data.ok) throw new Error(`HubSpot error ${data.status}: ${await data.text()}`);
    res.json(await data.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create Deal ───────────────────────────────────────────────────────────────
app.post('/api/deals', async (req, res) => {
  try {
    const { dealname, amount, dealstage, pipeline, closedate } = req.body;
    const data = await fetch(`${HS_BASE}/crm/v3/objects/deals`, {
      method: 'POST',
      headers: hsHeaders(),
      body: JSON.stringify({ properties: { dealname, amount, dealstage: dealstage || 'appointmentscheduled', pipeline: pipeline || 'default', closedate } }),
    });
    if (!data.ok) throw new Error(`HubSpot error ${data.status}: ${await data.text()}`);
    res.json(await data.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', token: HS_TOKEN ? 'configured' : 'missing' });
});

app.listen(PORT, () => {
  console.log(`HubSpot CRM Dashboard running on http://localhost:${PORT}`);
  if (!HS_TOKEN) console.warn('WARNING: HUBSPOT_ACCESS_TOKEN not set. Set it in .env');
});
