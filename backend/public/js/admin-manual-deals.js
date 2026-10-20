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

// ── Boot ─────────────────────────────────────────────────────
(function init() {
  var token = getToken();
  if (token) {
    showAdmin();
  } else {
    showLogin();
  }
})();
