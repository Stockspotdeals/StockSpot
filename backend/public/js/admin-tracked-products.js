// ============================================================
// StockSpot Admin — Tracked Product Management
// Uses Bearer token from localStorage (same as dashboard.html)
// ============================================================

const BACKEND_URL = '';  // same-origin — backend serves this page

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
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
}

// ── DOM refs ─────────────────────────────────────────────────
const loginSection   = document.getElementById('login-section');
const adminSection   = document.getElementById('admin-section');
const loginForm      = document.getElementById('login-form');
const loginMsg       = document.getElementById('login-message');
const formMsg        = document.getElementById('form-message');
const productForm    = document.getElementById('product-form');
const productList    = document.getElementById('product-list');
const addBtn         = document.getElementById('add-btn');
const refreshBtn     = document.getElementById('refresh-status-btn');
const workerDot      = document.getElementById('worker-dot');
const workerLabel    = document.getElementById('worker-label');

// ── Message helpers ──────────────────────────────────────────
function showMsg(el, text, type = 'success') {
  el.innerHTML = `<div class="message ${type}">${text}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 6000);
}

// ── Show/hide sections ───────────────────────────────────────
function showAdmin() {
  loginSection.style.display = 'none';
  adminSection.style.display = 'block';
  fetchStatus();
  fetchProducts();
}

function showLogin(msg) {
  adminSection.style.display = 'none';
  loginSection.style.display = 'block';
  if (msg) loginMsg.innerHTML = `<div class="message error">${msg}</div>`;
}

// ── Login ────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  loginMsg.innerHTML = '';

  try {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    if (!data.accessToken) throw new Error('No access token returned');
    saveToken(data.accessToken);
    showAdmin();
  } catch (err) {
    showMsg(loginMsg, err.message, 'error');
  }
});

// ── Pipeline status ──────────────────────────────────────────
async function fetchStatus() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/tracked-products/status`, {
      headers: authHeaders()
    });

    if (res.status === 401) {
      clearToken();
      showLogin('Session expired. Please log in again.');
      return;
    }

    const data = await res.json();
    document.getElementById('cnt-tracked').textContent   = data.trackedProductCount ?? '—';
    document.getElementById('cnt-products').textContent  = data.productCount         ?? '—';
    document.getElementById('cnt-signals').textContent   = data.signalCount          ?? '—';
    document.getElementById('cnt-alerts').textContent    = data.alertSignalCount     ?? '—';

    // Worker is running if the backend is up and responding to admin routes
    workerDot.className   = 'dot dot-green';
    workerLabel.textContent = 'MonitoringWorker: running (auto-started on boot)';
  } catch {
    workerDot.className   = 'dot dot-gray';
    workerLabel.textContent = 'MonitoringWorker: status unavailable';
  }
}

refreshBtn.addEventListener('click', () => {
  document.getElementById('cnt-tracked').textContent  = '…';
  document.getElementById('cnt-products').textContent = '…';
  document.getElementById('cnt-signals').textContent  = '…';
  document.getElementById('cnt-alerts').textContent   = '…';
  fetchStatus();
  fetchProducts();
});

// ── List products ────────────────────────────────────────────
async function fetchProducts() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/tracked-products`, {
      headers: authHeaders()
    });

    if (res.status === 401) {
      clearToken();
      showLogin('Session expired. Please log in again.');
      return;
    }

    const data = await res.json();
    renderProducts(data.products || []);
  } catch (err) {
    showMsg(formMsg, err.message, 'error');
  }
}

function renderProducts(products) {
  if (!products.length) {
    productList.innerHTML = '<tr><td colspan="5" style="color:#9ca3af;text-align:center;padding:2rem;">No tracked products yet.</td></tr>';
    return;
  }

  productList.innerHTML = products.map(p => `
    <tr>
      <td>${escHtml(p.title || '')}</td>
      <td>${escHtml(p.retailer || '')}</td>
      <td>${escHtml(p.category || '')}</td>
      <td><a href="${escHtml(p.url)}" target="_blank" rel="noopener">Link ↗</a></td>
      <td><button class="btn btn-danger delete-btn" data-id="${p._id}" style="padding:0.4rem 0.8rem;font-size:0.82rem;">Delete</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      if (!confirm('Delete this tracked product?')) return;
      await deleteProduct(id);
    });
  });
}

// ── Delete product ───────────────────────────────────────────
async function deleteProduct(id) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/tracked-products/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Delete failed');
    }
    showMsg(formMsg, 'Tracked product deleted.', 'success');
    fetchProducts();
    fetchStatus();
  } catch (err) {
    showMsg(formMsg, err.message, 'error');
  }
}

// ── Add product ──────────────────────────────────────────────
productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addBtn.disabled = true;

  const body = {
    title:    document.getElementById('title').value.trim(),
    retailer: document.getElementById('retailer').value,
    category: document.getElementById('category').value,
    url:      document.getElementById('url').value.trim()
  };

  try {
    const res = await fetch(`${BACKEND_URL}/api/tracked-products`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });

    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add tracked product');

    productForm.reset();
    showMsg(formMsg, `"${body.title}" added and queued for monitoring.`, 'success');
    fetchProducts();
    fetchStatus();
  } catch (err) {
    showMsg(formMsg, err.message, 'error');
  } finally {
    addBtn.disabled = false;
  }
});

// ── XSS helper ───────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ─────────────────────────────────────────────────────
(function init() {
  const token = getToken();
  if (token) {
    showAdmin();
  } else {
    showLogin();
  }
})();
