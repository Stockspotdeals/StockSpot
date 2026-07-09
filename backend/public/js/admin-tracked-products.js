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
const searchBtn      = document.getElementById('search-btn');
const searchInput    = document.getElementById('search-input');
const filterSource   = document.getElementById('filter-source');
const filterStatus   = document.getElementById('filter-status');
const workerDot      = document.getElementById('worker-dot');
const workerLabel    = document.getElementById('worker-label');

// ── Message helpers ──────────────────────────────────────────
function showMsg(el, text, type = 'success') {
  el.innerHTML = '<div class="message ' + type + '">' + text + '</div>';
  setTimeout(function () { el.innerHTML = ''; }, 6000);
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
    saveToken(data.accessToken);
    showAdmin();
  } catch (err) {
    showMsg(loginMsg, err.message, 'error');
  }
});

// ── Pipeline status ──────────────────────────────────────────
async function fetchStatus() {
  try {
    var res = await fetch(BACKEND_URL + '/api/tracked-products/status', {
      headers: authHeaders()
    });

    if (res.status === 401) {
      clearToken();
      showLogin('Session expired. Please log in again.');
      return;
    }

    var data = await res.json();
    document.getElementById('cnt-tracked').textContent   = data.trackedProductCount || '\u2014';
    document.getElementById('cnt-products').textContent  = data.productCount         || '\u2014';
    document.getElementById('cnt-signals').textContent   = data.signalCount          || '\u2014';
    document.getElementById('cnt-alerts').textContent    = data.alertSignalCount     || '\u2014';

    workerDot.className   = 'dot dot-green';
    workerLabel.textContent = 'MonitoringWorker: running (auto-started on boot)';
  } catch (_e) {
    workerDot.className   = 'dot dot-gray';
    workerLabel.textContent = 'MonitoringWorker: status unavailable';
  }
}

refreshBtn.addEventListener('click', function () {
  document.getElementById('cnt-tracked').textContent  = '\u2026';
  document.getElementById('cnt-products').textContent = '\u2026';
  document.getElementById('cnt-signals').textContent  = '\u2026';
  document.getElementById('cnt-alerts').textContent   = '\u2026';
  fetchStatus();
  fetchProducts();
});

// ── Search/filter ────────────────────────────────────────────
function getListParams() {
  var params = new URLSearchParams();
  var search = searchInput.value.trim();
  var source = filterSource.value;
  var status = filterStatus.value;

  if (search) params.set('search', search);
  if (source) params.set('source', source);
  if (status && status !== 'all') params.set('status', status);

  return params.toString();
}

searchBtn.addEventListener('click', function () {
  fetchProducts();
});

searchInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') fetchProducts();
});

// ── List products ────────────────────────────────────────────
async function fetchProducts() {
  try {
    var params = getListParams();
    var url = BACKEND_URL + '/api/tracked-products';
    if (params) url = url + '?' + params;
    var res = await fetch(url, {
      headers: authHeaders()
    });

    if (res.status === 401) {
      clearToken();
      showLogin('Session expired. Please log in again.');
      return;
    }

    var data = await res.json();
    renderProducts(data.products || []);
  } catch (err) {
    showMsg(formMsg, err.message, 'error');
  }
}

function renderProducts(products) {
  if (!products.length) {
    productList.innerHTML = '<tr><td colspan="8" style="color:#9ca3af;text-align:center;padding:2rem;">No tracked products found.</td></tr>';
    return;
  }

  productList.innerHTML = products.map(function (p) {
    var isActive = p.isActive !== false;
    var statusDot = isActive ? '\ud83d\udfe2' : '\ud83d\udd34';
    var statusLabel = isActive ? 'Active' : 'Inactive';
    var sourceLabel = p.source === 'owner' ? '\ud83d\udc64 Owner' : '\ud83e\udd16 Auto';
    var trackingTypeLabel = formatTrackingType(p.trackingType);

    return [
      '<tr>',
        '<td>' + escHtml(p.title || 'Unnamed') + '</td>',
        '<td style="font-size:0.85rem;">' + sourceLabel + '</td>',
        '<td style="font-size:0.85rem;">' + trackingTypeLabel + '</td>',
        '<td><span style="cursor:pointer;" class="toggle-btn" data-id="' + p._id + '" data-active="' + isActive + '" title="Click to toggle">' + statusDot + ' ' + statusLabel + '</span></td>',
        '<td>' + escHtml(p.retailer || '') + '</td>',
        '<td>' + escHtml(p.category || '') + '</td>',
        '<td><a href="' + escHtml(p.url) + '" target="_blank" rel="noopener">Link \u2197</a></td>',
        '<td style="white-space:nowrap;">',
          '<select class="tracking-type-select" data-id="' + p._id + '" style="padding:0.3rem;font-size:0.8rem;border:1px solid #cbd5e1;border-radius:4px;">',
            '<option value="restock"' + (p.trackingType === 'restock' ? ' selected' : '') + '>Restock</option>',
            '<option value="price_drop"' + (p.trackingType === 'price_drop' ? ' selected' : '') + '>Price Drop</option>',
            '<option value="preorder"' + (p.trackingType === 'preorder' ? ' selected' : '') + '>Preorder</option>',
            '<option value="release"' + (p.trackingType === 'release' ? ' selected' : '') + '>Release</option>',
          '</select>',
          '<button class="btn btn-danger delete-btn" data-id="' + p._id + '" style="padding:0.3rem 0.6rem;font-size:0.8rem;margin-left:0.4rem;">Del</button>',
        '</td>',
      '</tr>'
    ].join('');
  }).join('');

  // Delete handlers
  document.querySelectorAll('.delete-btn').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      var id = e.target.dataset.id;
      if (!confirm('Delete this tracked product?')) return;
      await deleteProduct(id);
    });
  });

  // Toggle active handlers
  document.querySelectorAll('.toggle-btn').forEach(function (el) {
    el.addEventListener('click', async function (e) {
      var id = e.currentTarget.dataset.id;
      var currentlyActive = e.currentTarget.dataset.active === 'true';
      await toggleActive(id, !currentlyActive);
    });
  });

  // Tracking type change handlers
  document.querySelectorAll('.tracking-type-select').forEach(function (sel) {
    sel.addEventListener('change', async function (e) {
      var id = e.target.dataset.id;
      var newType = e.target.value;
      await updateTrackingType(id, newType);
    });
  });
}

function formatTrackingType(type) {
  switch (type) {
    case 'restock': return '\ud83d\udd04 Restock';
    case 'price_drop': return '\ud83d\udcc9 Price Drop';
    case 'preorder': return '\ud83d\udccb Preorder';
    case 'release': return '\ud83d\ude80 Release';
    default: return type || 'restock';
  }
}

// ── Delete product ───────────────────────────────────────────
async function deleteProduct(id) {
  try {
    var res = await fetch(BACKEND_URL + '/api/tracked-products/' + id, {
      method: 'DELETE',
      headers: authHeaders()
    });

    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }
    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.error || 'Delete failed');
    }
    showMsg(formMsg, 'Tracked product deleted.', 'success');
    fetchProducts();
    fetchStatus();
  } catch (err) {
    showMsg(formMsg, err.message, 'error');
  }
}

// ── Toggle active ────────────────────────────────────────────
async function toggleActive(id, newActive) {
  try {
    var res = await fetch(BACKEND_URL + '/api/tracked-products/' + id, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ isActive: newActive })
    });

    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }
    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.error || 'Toggle failed');
    }
    fetchProducts();
  } catch (err) {
    showMsg(formMsg, err.message, 'error');
  }
}

// ── Update tracking type ─────────────────────────────────────
async function updateTrackingType(id, trackingType) {
  try {
    var res = await fetch(BACKEND_URL + '/api/tracked-products/' + id, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ trackingType: trackingType })
    });

    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }
    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.error || 'Update failed');
    }
    showMsg(formMsg, 'Tracking type updated.', 'success');
  } catch (err) {
    showMsg(formMsg, err.message, 'error');
  }
}

// ── Add product ──────────────────────────────────────────────
productForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  addBtn.disabled = true;

  var body = {
    title:        document.getElementById('title').value.trim(),
    retailer:     document.getElementById('retailer').value,
    category:     document.getElementById('category').value,
    trackingType: document.getElementById('tracking-type').value,
    url:          document.getElementById('url').value.trim(),
    notes:        document.getElementById('notes').value.trim()
  };

  try {
    var res = await fetch(BACKEND_URL + '/api/tracked-products', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });

    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }

    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add tracked product');

    productForm.reset();
    showMsg(formMsg, '"' + body.title + '" added and queued for monitoring.', 'success');
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
  var amp = String.fromCharCode(38) + 'amp;';
  var lt  = String.fromCharCode(38) + 'lt;';
  var gt  = String.fromCharCode(38) + 'gt;';
  var quot = String.fromCharCode(38) + 'quot;';
  str = String(str);
  str = str.replace(/[\x26]/g, amp);
  str = str.replace(/[\x3C]/g, lt);
  str = str.replace(/[\x3E]/g, gt);
  str = str.replace(/[\x22]/g, quot);
  return str;
}

// ── Boot ─────────────────────────────────────────────────────
(function init() {
  var token = getToken();
  if (token) {
    showAdmin();
  } else {
    showLogin();
  }
})();