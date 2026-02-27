/**
 * StockSpot Website - Main JavaScript
 * Handles navigation, form submissions, and interactions
 */

// ============================================================================
// NAVIGATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initializeNavigation();
  initializeEmailForm();
  initializeScrollAnimations();
  initializeDownloadButton();
});

function initializeNavigation() {
  const hamburger = document.querySelector('.hamburger');
  const navMobile = document.querySelector('.nav-mobile');

  if (!hamburger) return;

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navMobile.classList.toggle('active');
  });

  // Close mobile nav when a link is clicked
  const mobileLinks = navMobile.querySelectorAll('a');
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navMobile.classList.remove('active');
    });
  });

  // Close mobile nav when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('header')) {
      hamburger.classList.remove('active');
      navMobile.classList.remove('active');
    }
  });
}

// ============================================================================
// EMAIL FORM HANDLING
// ============================================================================

function initializeEmailForm() {
  const forms = document.querySelectorAll('[data-form="email-signup"]');
  
  forms.forEach(form => {
    form.addEventListener('submit', handleEmailSubmit);
  });
}

function handleEmailSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const emailInput = form.querySelector('input[type="email"]');
  const submitBtn = form.querySelector('button[type="submit"]');
  const messageDiv = form.querySelector('.form-message');

  if (!emailInput || !emailInput.value.trim()) {
    showFormMessage(messageDiv, 'Please enter a valid email address', 'error');
    return;
  }

  const email = emailInput.value.trim().toLowerCase();

  // Validate email format
  if (!isValidEmail(email)) {
    showFormMessage(messageDiv, 'Please enter a valid email address', 'error');
    return;
  }

  // Log to console (no backend yet)
  console.log('Email signup:', {
    email: email,
    timestamp: new Date().toISOString(),
    source: form.closest('section')?.getAttribute('class') || 'unknown'
  });

  // Store in localStorage for demo purposes
  try {
    let emails = JSON.parse(localStorage.getItem('stockspot_emails') || '[]');
    if (!emails.includes(email)) {
      emails.push(email);
      localStorage.setItem('stockspot_emails', JSON.stringify(emails));
    }
  } catch (err) {
    console.error('Could not save email:', err);
  }

  // Show success message
  showFormMessage(messageDiv, '✓ Thanks! We\'ll send you deal alerts soon.', 'success');

  // Clear form
  emailInput.value = '';

  // Disable submit button briefly
  submitBtn.disabled = true;
  submitBtn.textContent = 'Subscribed!';
  
  setTimeout(() => {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Join Alert List';
  }, 3000);
}

function showFormMessage(messageDiv, text, type) {
  if (!messageDiv) return;

  messageDiv.textContent = text;
  messageDiv.className = 'form-message ' + type;
  messageDiv.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      messageDiv.style.display = 'none';
    }, 4000);
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ============================================================================
// SCROLL ANIMATIONS
// ============================================================================

function initializeScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe cards and sections
  document.querySelectorAll('.step, .deal-card, .trust-item').forEach(el => {
    observer.observe(el);
  });
}

// ============================================================================
// SMOOTH SCROLL BEHAVIOR
// ============================================================================

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    
    if (href === '#') {
      e.preventDefault();
      return;
    }

    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// ============================================================================
// UTILITY: PWA / INSTALLABLE APP
// ============================================================================

// Register service worker if available
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/website/service-worker.js').catch(err => {
    console.log('Service Worker registration failed:', err);
  });
}

// ============================================================================
// DOWNLOAD BUTTON
// ============================================================================

function initializeDownloadButton() {
  const downloadBtn = document.querySelector('.app-download-btn');
  if (downloadBtn && downloadBtn.tagName === 'A') {
    // If it's an anchor tag, let it handle naturally (download attribute will work)
    downloadBtn.addEventListener('click', (e) => {
      // Just let the browser handle the download
      // The 'download' attribute on the link will trigger the download
    });
  }
}


// Expose email list in console for testing
window.getSignupEmails = () => {
  const emails = JSON.parse(localStorage.getItem('stockspot_emails') || '[]');
  console.log('Collected emails:', emails);
  return emails;
};

window.clearSignupEmails = () => {
  localStorage.removeItem('stockspot_emails');
  console.log('Cleared all signup emails');
};
