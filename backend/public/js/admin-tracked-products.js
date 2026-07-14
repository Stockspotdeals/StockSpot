// ============================================================
// StockSpot Admin — Owner Intelligence Dashboard
// Uses Bearer token from localStorage (same as dashboard.html)
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
const loginSection   = document.getElementById('login-section');
const adminSection   = document.getElementById('admin-section');
const loginForm      = document.getElementById('login-form');
const loginMsg       = document.getElementById('login-message');
const formMsg        = document.getElementById('form-message');
const addFormMsg     = document.getElementById('add-form-message') || formMsg;
const productForm    = document.getElementById('product-form');
const productList    = document.getElementById('product-list');
const addBtn         = document.getElementById('add-btn');
const refreshBtn     = document.getElementById('refresh-status-btn');
const filterApplyBtn = document.getElementById('filter-apply-btn');

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
  fetchPipelineStatus();
  fetchDashboard();
  fetchProducts();
}

function showLogin(msg) {
  adminSection.style.display = 'none';
  loginSection.style.display = 'block';
  if (msg) loginMsg.innerHTML = '<div class="message error">' + msg + '</div>';
}

// ── Tab switching ────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
    tab.classList.add('active');
    var content = document.getElementById('tab-' + tab.dataset.tab);
    if (content) content.classList.add('active');
    // Refresh data when switching tabs
    if (tab.dataset.tab === 'dashboard') { fetchPipelineStatus(); fetchDashboard(); }
    if (tab.dataset.tab === 'products') { fetchProducts(); }
  });
});

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
async function fetchPipelineStatus() {
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
    document.getElementById('cnt-tracked').textContent  = data.trackedProductCount || '\u2014';
    document.getElementById('cnt-products').textContent = data.productCount         || '\u2014';
    document.getElementById('cnt-signals').textContent  = data.signalCount          || '\u2014';
    document.getElementById('cnt-alerts').textContent   = data.alertSignalCount     || '\u2014';

    var dot = document.getElementById('worker-dot');
    var label = document.getElementById('worker-label');
    dot.className = 'dot dot-green';
    label.textContent = 'MonitoringWorker: running (auto-started on boot)';
  } catch (_e) {
    var dot = document.getElementById('worker-dot');
    var label = document.getElementById('worker-label');
    dot.className = 'dot dot-gray';
    label.textContent = 'MonitoringWorker: status unavailable';
  }
}

// ── Dashboard data ───────────────────────────────────────────
async function fetchDashboard() {
  try {
    var res = await fetch(BACKEND_URL + '/api/tracked-products/dashboard', {
      headers: authHeaders()
    });
    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }
    if (!res.ok) return;
    var data = await res.json();

    // Summary cards
    var s = data.summary || {};
    document.getElementById('dash-total').textContent     = s.total || 0;
    document.getElementById('dash-auto').textContent      = s.autoDiscovered || 0;
    document.getElementById('dash-owner').textContent     = s.ownerAdded || 0;
    document.getElementById('dash-active').textContent    = s.active || 0;
    document.getElementById('dash-inactive').textContent  = s.inactive || 0;
    document.getElementById('dash-preorder').textContent  = s.preorder || 0;
    document.getElementById('dash-restock').textContent   = s.restock || 0;
    document.getElementById('dash-pricedrop').textContent = s.priceDrop || 0;
    document.getElementById('dash-avg-hype').textContent  = s.averageHypeScore || 0;
    document.getElementById('dash-max-hype').textContent  = s.maxHypeScore || 0;

    // Health bar
    var h = data.health || { healthy: 0, warning: 0, error: 0 };
    var totalH = h.healthy + h.warning + h.error;
    if (totalH > 0) {
      document.getElementById('health-healthy').style.width  = Math.round((h.healthy / totalH) * 100) + '%';
      document.getElementById('health-healthy').textContent  = h.healthy;
      document.getElementById('health-warning').style.width  = Math.round((h.warning / totalH) * 100) + '%';
      document.getElementById('health-warning').textContent  = h.warning;
      document.getElementById('health-error').style.width    = Math.round((h.error / totalH) * 100) + '%';
      document.getElementById('health-error').textContent    = h.error;
    }

    // Upcoming releases
    var releasesEl = document.getElementById('upcoming-releases');
    var releases = data.upcomingReleases || [];
    if (releases.length === 0) {
      releasesEl.innerHTML = '<p style="color:#9ca3af;">No upcoming releases in the next 30 days.</p>';
    } else {
      releasesEl.innerHTML = releases.map(function (r) {
        var d = new Date(r.releaseDate);
        var dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        return '<div class="release-item"><span>' + escHtml(r.title || 'Unnamed') + ' <span class="release-date">(' + escHtml(r.retailer || '') + ')</span></span><span class="release-date">' + dateStr + '</span></div>';
      }).join('');
    }

    // Breakdowns
    renderBreakdown('breakdown-retailer', data.breakdowns.byRetailer);
    renderBreakdown('breakdown-category', data.breakdowns.byCategory);
    renderBreakdown('breakdown-tracking', data.breakdowns.byTrackingType);
    renderBreakdown('breakdown-source', data.breakdowns.bySource);

  } catch (_e) {
    // Dashboard refresh is non-critical
  }
}

function renderBreakdown(elId, items) {
  var tbody = document.querySelector('#' + elId + ' tbody');
  if (!tbody) return;
  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="color:#9ca3af;">No data</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(function (item) {
    return '<tr><td>' + escHtml(item._id || 'unknown') + '</td><td style="text-align:right;font-weight:600;">' + item.count + '</td></tr>';
  }).join('');
}

// ── Filter/build params ──────────────────────────────────────
function getListParams() {
  var params = new URLSearchParams();
  var search = document.getElementById('filter-search').value.trim();
  var source = document.getElementById('filter-source').value;
  var status = document.getElementById('filter-status').value;
  var retailer = document.getElementById('filter-retailer').value;
  var category = document.getElementById('filter-category').value;
  var trackingType = document.getElementById('filter-tracking').value;
  var sort = document.getElementById('filter-sort').value;
  var hypeMin = document.getElementById('filter-hype-min').value;
  var hypeMax = document.getElementById('filter-hype-max').value;
  var releaseAfter = document.getElementById('filter-release-after').value;
  var releaseBefore = document.getElementById('filter-release-before').value;
  var page = document.getElementById('filter-page') ? document.getElementById('filter-page').value : 1;

  if (search) params.set('search', search);
  if (source) params.set('source', source);
  if (status && status !== 'all') params.set('status', status);
  if (retailer) params.set('retailer', retailer);
  if (category) params.set('category', category);
  if (trackingType) params.set('trackingType', trackingType);
  if (sort) params.set('sort', sort);
  if (hypeMin) params.set('hypeMin', hypeMin);
  if (hypeMax) params.set('hypeMax', hypeMax);
  if (releaseAfter) params.set('releaseAfter', releaseAfter);
  if (releaseBefore) params.set('releaseBefore', releaseBefore);
  if (page) params.set('page', page);

  return params.toString();
}

filterApplyBtn.addEventListener('click', function () {
  fetchProducts();
});

// Enter key on search field
document.getElementById('filter-search').addEventListener('keydown', function (e) {
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
    renderPagination(data);
    var pc = document.getElementById('product-count');
    if (pc) pc.textContent = data.total + ' product' + (data.total !== 1 ? 's' : '') + ' found';
  } catch (err) {
    showMsg(formMsg, err.message, 'error');
  }
}

function renderProducts(products) {
  if (!products.length) {
    productList.innerHTML = '<tr><td colspan="13" style="color:#9ca3af;text-align:center;padding:2rem;">No tracked products found.</td></tr>';
    return;
  }

  productList.innerHTML = products.map(function (p) {
    var isActive = p.isActive !== false;
    var statusDot = isActive ? '\u{1F7E2}' : '\u{1F534}';
    var statusLabel = isActive ? 'Active' : 'Inactive';
    var sourceLabel = p.source === 'owner' ? '\u{1F464} Owner' : '\u{1F916} Auto';
    var trackingTypeLabel = formatTrackingType(p.trackingType);

    // Health indicator
    var healthDot, healthLabel;
    if (!isActive || (p.errorCount || 0) > 5) {
      healthDot = '\u{1F534}';
      healthLabel = 'Error';
    } else if ((p.errorCount || 0) > 0) {
      healthDot = '\u{1F7E1}';
      healthLabel = 'Warning';
    } else {
      healthDot = '\u{1F7E2}';
      healthLabel = 'Healthy';
    }

    var lastCheckedStr = '—';
    if (p.lastCheckedAt) {
      var d = new Date(p.lastCheckedAt);
      if (!isNaN(d.getTime())) lastCheckedStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    var errorCount = p.errorCount || 0;
    var errorLabel = errorCount > 0 ? errorCount : '—';

    return [
      '<tr>',
        '<td>' + escHtml(p.title || 'Unnamed') + '</td>',
        '<td style="font-size:0.85rem;">' + sourceLabel + '</td>',
        '<td style="font-size:0.85rem;">' + trackingTypeLabel + '</td>',
        '<td><span class="action-btn toggle" data-id="' + p._id + '" data-active="' + isActive + '" title="Click to toggle">' + statusDot + ' ' + statusLabel + '</span></td>',
        '<td style="font-size:0.85rem;">' + healthDot + ' ' + healthLabel + '</td>',
        '<td style="font-size:0.85rem;">' + formatDate(p.releaseDate) + '</td>',
        '<td style="font-size:0.85rem;">' + (typeof p.hypeScore === 'number' && p.hypeScore > 0 ? p.hypeScore + '/100' : '—') + '</td>',
        '<td>' + escHtml(p.retailer || '') + '</td>',
        '<td>' + escHtml(p.category || '') + '</td>',
        '<td style="font-size:0.8rem;">' + lastCheckedStr + '</td>',
        '<td style="font-size:0.85rem;color:' + (errorCount > 0 ? '#ef4444' : '#9ca3af') + ';">' + errorLabel + '</td>',
        '<td><a href="' + escHtml(p.url) + '" target="_blank" rel="noopener">Link \u{2197}</a></td>',
        '<td style="white-space:nowrap;">',
          '<select class="tracking-type-select" data-id="' + p._id + '" style="padding:0.25rem;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;">',
            '<option value="restock"' + (p.trackingType === 'restock' ? ' selected' : '') + '>Restock</option>',
            '<option value="price_drop"' + (p.trackingType === 'price_drop' ? ' selected' : '') + '>Price Drop</option>',
            '<option value="preorder"' + (p.trackingType === 'preorder' ? ' selected' : '') + '>Preorder</option>',
            '<option value="release"' + (p.trackingType === 'release' ? ' selected' : '') + '>Release</option>',
          '</select>',
          '<button class="action-btn check" data-id="' + p._id + '" title="Run check now">\u{1F504}</button>',
          '<button class="action-btn delete" data-id="' + p._id + '" title="Delete">\u{1F5D1}</button>',
        '</td>',
      '</tr>'
    ].join('');
  }).join('');

  // Delete handlers
  document.querySelectorAll('.action-btn.delete').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      var id = e.target.dataset.id;
      if (!confirm('Delete this tracked product?')) return;
      await deleteProduct(id);
    });
  });

  // Toggle active handlers (click on status cell)
  document.querySelectorAll('.action-btn.toggle').forEach(function (el) {
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
      await updateProduct(id, { trackingType: newType });
    });
  });

  // Run check handlers
  document.querySelectorAll('.action-btn.check').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      var id = e.target.dataset.id;
      btn.disabled = true;
      btn.textContent = '\u23F3';
      try {
        var res = await fetch(BACKEND_URL + '/api/tracked-products/' + id + '/check', {
          method: 'POST',
          headers: authHeaders()
        });
        if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }
        var data = await res.json();
        if (res.ok) {
          showMsg(formMsg, 'Check complete. Changes: ' + (data.result.changes || []).length, 'success');
        } else {
          showMsg(formMsg, data.error || 'Check failed', 'error');
        }
      } catch (err) {
        showMsg(formMsg, err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '\u{1F504}';
        fetchProducts();
      }
    });
  });
}

function renderPagination(data) {
  var el = document.getElementById('pagination');
  if (!el) return;
  var page = data.page || 1;
  var pages = data.pages || 1;
  if (pages <= 1) { el.innerHTML = ''; return; }

  var html = '';
  if (page > 1) {
    html += '<button class="btn btn-secondary page-btn" data-page="' + (page - 1) + '" style="padding:0.4rem 0.8rem;font-size:0.85rem;">\u2190 Prev</button>';
  }
  html += '<span style="padding:0.4rem 0.8rem;font-size:0.85rem;">Page ' + page + ' of ' + pages + '</span>';
  if (page < pages) {
    html += '<button class="btn btn-secondary page-btn" data-page="' + (page + 1) + '" style="padding:0.4rem 0.8rem;font-size:0.85rem;">Next \u2192</button>';
  }
  el.innerHTML = html;

  document.querySelectorAll('.page-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.getElementById('filter-page').value = btn.dataset.page;
      fetchProducts();
    });
  });
}

// Create hidden page input if not present
(function ensurePageInput() {
  if (!document.getElementById('filter-page')) {
    var input = document.createElement('input');
    input.type = 'hidden';
    input.id = 'filter-page';
    input.value = '1';
    document.body.appendChild(input);
  }
})();

function formatDate(dateStr) {
  if (!dateStr) return '—';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTrackingType(type) {
  switch (type) {
    case 'restock': return '\u{1F504} Restock';
    case 'price_drop': return '\u{1F4C9} Price Drop';
    case 'preorder': return '\u{1F4CB} Preorder';
    case 'release': return '\u{1F680} Release';
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
    fetchPipelineStatus();
    fetchDashboard();
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

// ── General update ───────────────────────────────────────────
async function updateProduct(id, updates) {
  try {
    var res = await fetch(BACKEND_URL + '/api/tracked-products/' + id, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(updates)
    });

    if (res.status === 401) { clearToken(); showLogin('Session expired.'); return; }
    if (!res.ok) {
      var err = await res.json();
      throw new Error(err.error || 'Update failed');
    }
    showMsg(formMsg, 'Product updated.', 'success');
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
    releaseDate:  document.getElementById('release-date').value || null,
    hypeScore:    document.getElementById('hype-score').value ? Number(document.getElementById('hype-score').value) : undefined,
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
    showMsg(addFormMsg, '"' + body.title + '" added and queued for monitoring.', 'success');
    fetchProducts();
    fetchDashboard();
  } catch (err) {
    showMsg(addFormMsg, err.message, 'error');
  } finally {
    addBtn.disabled = false;
  }
});

// ── Refresh button ───────────────────────────────────────────
refreshBtn.addEventListener('click', function () {
  document.getElementById('cnt-tracked').textContent  = '\u2026';
  document.getElementById('cnt-products').textContent = '\u2026';
  document.getElementById('cnt-signals').textContent  = '\u2026';
  document.getElementById('cnt-alerts').textContent   = '\u2026';
  fetchPipelineStatus();
  fetchDashboard();
  fetchProducts();
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