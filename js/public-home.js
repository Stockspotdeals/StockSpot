const BACKEND_URL = 'https://stockspot.onrender.com';

const appState = {
  accessToken: localStorage.getItem('stockspotAccessToken'),
  user: null,
  deferredPrompt: null
};

const header = document.querySelector('.site-header');
const menuToggle = document.getElementById('menuToggle');
const primaryNav = document.getElementById('primaryNav');
const currentYear = document.getElementById('currentYear');
const userStatus = document.getElementById('userStatus');
const loginNav = document.getElementById('loginNav');
const logoutNav = document.getElementById('logoutNav');
const loginModal = document.getElementById('loginModal');
const registerModal = document.getElementById('registerModal');
const comingSoonModal = document.getElementById('comingSoonModal');

const authHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (appState.accessToken) {
    headers.Authorization = `Bearer ${appState.accessToken}`;
  }
  return headers;
};

const apiFetch = async (path, options = {}) => {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message || body?.error || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body;
};

const setAccessToken = (token) => {
  appState.accessToken = token || null;
  if (token) {
    localStorage.setItem('stockspotAccessToken', token);
  } else {
    localStorage.removeItem('stockspotAccessToken');
  }
};

const setModalState = (modal, isOpen) => {
  if (!modal) {
    return;
  }
  modal.classList.toggle('is-open', isOpen);
  modal.setAttribute('aria-hidden', String(!isOpen));
};

const showComingSoonModal = () => setModalState(comingSoonModal, true);
const openLoginModal = () => setModalState(loginModal, true);
const closeLoginModal = () => setModalState(loginModal, false);
const openRegisterModal = () => setModalState(registerModal, true);
const closeRegisterModal = () => setModalState(registerModal, false);

const updateAuthDisplay = () => {
  const loggedIn = Boolean(appState.user);
  if (loginNav) {
    loginNav.style.display = loggedIn ? 'none' : 'inline-flex';
  }
  if (logoutNav) {
    logoutNav.style.display = loggedIn ? 'inline-flex' : 'none';
  }
  if (userStatus) {
    if (loggedIn) {
      userStatus.textContent = `Logged in as ${appState.user.email}`;
      userStatus.style.display = 'inline-flex';
    } else {
      userStatus.textContent = '';
      userStatus.style.display = 'none';
    }
  }
};

const logout = () => {
  setAccessToken(null);
  appState.user = null;
  updateAuthDisplay();
  closeLoginModal();
  closeRegisterModal();
};

const loadCurrentUser = async () => {
  if (!appState.accessToken) {
    updateAuthDisplay();
    return;
  }
  try {
    const data = await apiFetch('/auth/me');
    appState.user = data.user;
  } catch (error) {
    console.warn('Failed to load current user:', error);
    setAccessToken(null);
    appState.user = null;
  }
  updateAuthDisplay();
};

const handleLoginSubmit = async (event) => {
  event.preventDefault();
  try {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setAccessToken(data.accessToken);
    appState.user = data.user;
    updateAuthDisplay();
    closeLoginModal();
    window.location.href = 'dashboard.html';
  } catch (error) {
    alert(error.message || 'Login failed');
  }
};

const handleRegisterSubmit = async (event) => {
  event.preventDefault();
  try {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();
    const confirmPassword = document.getElementById('registerConfirmPassword').value.trim();
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, confirmPassword })
    });
    setAccessToken(data.accessToken);
    appState.user = data.user;
    updateAuthDisplay();
    closeRegisterModal();
    window.location.href = 'dashboard.html';
  } catch (error) {
    alert(error.message || 'Registration failed');
  }
};

const toggleNav = () => {
  if (!header || !menuToggle) {
    return;
  }
  const isOpen = header.classList.toggle('nav-open');
  document.body.classList.toggle('menu-open', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
};

const closeNav = () => {
  if (!header || !menuToggle) {
    return;
  }
  header.classList.remove('nav-open');
  document.body.classList.remove('menu-open');
  menuToggle.setAttribute('aria-expanded', 'false');
};

const installApp = async () => {
  if (!appState.deferredPrompt) {
    showComingSoonModal();
    return;
  }
  appState.deferredPrompt.prompt();
  await appState.deferredPrompt.userChoice.catch(() => null);
  appState.deferredPrompt = null;
};

const setupReveal = () => {
  const revealTargets = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    revealTargets.forEach((target) => target.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealTargets.forEach((target) => observer.observe(target));
};

document.addEventListener('DOMContentLoaded', () => {
  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }
  menuToggle?.addEventListener('click', toggleNav);
  primaryNav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav));
  document.querySelectorAll('.utility-actions a').forEach((link) => link.addEventListener('click', closeNav));
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => {
      setModalState(comingSoonModal, false);
      closeLoginModal();
      closeRegisterModal();
    });
  });
  document.querySelectorAll('#pwaHeroButton, #premiumPreviewButton, #installPreviewButton').forEach((button) => {
    button.addEventListener('click', showComingSoonModal);
  });
  document.getElementById('installAppButton')?.addEventListener('click', installApp);
  loginNav?.addEventListener('click', openLoginModal);
  logoutNav?.addEventListener('click', logout);
  document.getElementById('showRegister')?.addEventListener('click', () => {
    closeLoginModal();
    openRegisterModal();
  });
  document.getElementById('showLogin')?.addEventListener('click', () => {
    closeRegisterModal();
    openLoginModal();
  });
  document.getElementById('loginForm')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('registerForm')?.addEventListener('submit', handleRegisterSubmit);
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        setModalState(modal, false);
      }
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setModalState(comingSoonModal, false);
      closeLoginModal();
      closeRegisterModal();
      closeNav();
    }
  });
  loadCurrentUser();
  setupReveal();
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  appState.deferredPrompt = event;
});