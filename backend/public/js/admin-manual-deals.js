// ============================================================
// StockSpot Admin — Manual Deal Publishing
// Uses Bearer token from localStorage (same as admin-tracked-products.js)
// ============================================================

const BACKEND_URL = '';  // same-origin

// ── Token helpers ────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('token') || localStorage.getItem('stockspotAccessToken') || null;
}

function saveToken(token) {
  localStorage.setItem('token', token);
  localStorage.setItem('stockspotAccessToken', token);
}

function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('stockspotAccessToken');
}

function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': 'Bearer ' + token } : {})
  };
}

// ── DOM refs ─────────────────────────────────────────────────
const loginSection = document.getElementById('login-section');
const adminSection = document.getElementById('admin-section');
const loginForm    = document.getElementById('login-form');
const loginMsg     = document.getElementById('login-message');
const dealForm     = document.getElementById('deal-form');
const formMsg      = document.getElementById('form-message');
const publishBtn   = document.getElementById('publish-btn');

// ── Message helpers ──────────────────────────────────────────
function showMsg(el, text, type) {
  if (!type) type = 'success';
  el.innerHTML = '<div class="message ' + type + '">' + text + '</div>';
  setTimeout(function () { el.innerHTML = ''; }, 6000);
}

// ── Show/hide sections ───────────────────────────────────────
function showAdmin() {
  loginSection.style.display = 'none';
  adminSection.style.display = 'block';
  loadPublishedDeals();
}

function showLogin(msg) {
  adminSection.style.display = 'none';
  loginSection.style.display = 'block';
  if (msg) loginMsg.innerHTML = '<div class="message error">' + msg + '</div>';
}

// ── Login ────────────────────────────────────────────────────
loginForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  var email    = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;
  loginMsg.innerHTML = '';

  try {
    var res = await fetch(BACKEND_URL + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    if (!data.accessToken) throw new Error('No access token returned');

    // The API and the page route both enforce plan === 'admin' server-side;
    // this check only avoids showing a form that would always fail.
    if (!data.user || data.user.plan !== 'admin') {
      throw new Error('Administrator privileges required');
    }

    saveToken(data.accessToken);
    showAdmin();
  } catch (err) {
    clearToken();
    showMsg(loginMsg, err.message, 'error');
  }
});

// ── Publish manual deal ──────────────────────────────────────
dealForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  publishBtn.disabled = true;

  var dealUrl  = document.getElementById('deal-url').value.trim();
  var category = document.getElementById('deal-category').value;
  var promoCode = document.getElementById('deal-promo').value.trim();
  var productName = document.getElementById('deal-name').value.trim();
  var imageUrl = document.getElementById('deal-image').value.trim();

  var body = { dealUrl: dealUrl, category: category, name: productName };
  if (promoCode) body.promoCode = promoCode;
  if (imageUrl) body.image = imageUrl;

  try {
    var res = await fetch(BACKEND_URL + '/api/admin/deals', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });

    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }

    var data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to publish deal');

    dealForm.reset();
    var successText = 'Deal published successfully.';
    if (data.retired && data.retired.archivedCount > 0) {
      successText += ' Archived ' + data.retired.archivedCount +
        ' older deal(s) in this category to stay within the active cap.';
    }
    showMsg(formMsg, successText, 'success');
  } catch (err) {
    showMsg(formMsg, err.message, 'error');
  } finally {
    publishBtn.disabled = false;
  }
});

// ── Published deals list & removal ────────────────────────────
var removeMsg = document.getElementById('remove-message');
var removingIds = {};   // in-flight removals — blocks duplicate submissions

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Neutral label for legacy deals whose stored name is a URL/hostname.
function dealLabel(raw) {
  if (!raw || /^https?:\/\//i.test(raw)) return 'Untitled Deal';
  if (!/\s/.test(raw) && /^[a-z0-9-]+(\.[a-z0-9-]+)+([\/?#].*)?$/i.test(raw)) return 'Untitled Deal';
  return raw;
}

async function loadPublishedDeals() {
  var list = document.getElementById('published-deals-list');
  if (!list) return;
  try {
    var res = await fetch(BACKEND_URL + '/api/deals');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var deals = Array.isArray(data.deals) ? data.deals : [];
    if (!deals.length) {
      list.innerHTML = '<p class="hint">No published deals yet.</p>';
      return;
    }
    list.innerHTML = deals.map(function (deal) {
      var parts = ['<strong>' + escapeHtml(dealLabel(deal.title || deal.name || '')) + '</strong>'];
      if (deal.category) parts.push('<span>' + escapeHtml(deal.category) + '</span>');
      if (deal.promoCode) parts.push('<span>Code: ' + escapeHtml(deal.promoCode) + '</span>');
      if (deal.postedAt) parts.push('<span>' + new Date(deal.postedAt).toLocaleDateString() + '</span>');
      var link = deal.affiliateLink || deal.url || '';
      if (link) parts.push('<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener sponsored">View deal</a>');
      parts.push('<button type="button" class="btn remove-btn" data-deal-id="' + escapeHtml(String(deal._id || '')) + '" style="background:#dc2626;padding:0.35rem 0.8rem;font-size:0.85rem;">Remove</button>');
      return '<div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;padding:0.6rem 0;border-top:1px solid #e5e7eb;">' +
        parts.join('') + '</div>';
    }).join('');
  } catch (err) {
    list.innerHTML = '<p class="hint">Could not load published deals.</p>';
  }
}

document.getElementById('published-deals-list').addEventListener('click', async function (e) {
  var btn = e.target.closest('.remove-btn');
  if (!btn) return;
  var dealId = btn.getAttribute('data-deal-id');
  if (!dealId || removingIds[dealId]) return;
  if (!window.confirm('Remove this deal from the public feeds? The record is archived, not deleted.')) return;

  removingIds[dealId] = true;
  btn.disabled = true;
  try {
    var res = await fetch(BACKEND_URL + '/api/admin/deals/' + encodeURIComponent(dealId), {
      method: 'DELETE',
      headers: authHeaders()
    });
    var data = await res.json().catch(function () { return {}; });
    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }
    if (!res.ok) throw new Error(data.error || data.message || ('Remove failed (HTTP ' + res.status + ')'));

    showMsg(removeMsg, 'Deal removed from the feed.', 'success');
    loadPublishedDeals();
  } catch (err) {
    showMsg(removeMsg, err.message || 'Failed to remove deal.', 'error');
    btn.disabled = false;
  } finally {
    delete removingIds[dealId];
  }
});

// ── Boot ─────────────────────────────────────────────────────
(function init() {
  var token = getToken();
  if (token) {
    showAdmin();
  } else {
    showLogin();
  }
})();
