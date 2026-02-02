# StockSpot Website

A production-ready, Amazon Associates-compliant static website for StockSpot deal alerts service.

## 📋 Overview

This is the public-facing website for StockSpot, a free service that sends real-time alerts for product restocks and price drops across major retailers (Amazon, Best Buy, Walmart, Target, eBay, and more).

**Key Features:**
- ✅ 100% static HTML, CSS, JavaScript (no build step required)
- ✅ Fully responsive design (mobile, tablet, desktop)
- ✅ Amazon Associates compliant with clear affiliate disclosures
- ✅ Privacy-first: no tracking pixels, no cookies for ads
- ✅ PWA-enabled: installable as an app on mobile devices
- ✅ GitHub Pages ready: deploy directly without configuration
- ✅ Fast: optimized CSS, no external dependencies
- ✅ Accessible: semantic HTML, keyboard navigation

## 📁 Folder Structure

```
website/
├── index.html              # Homepage
├── about.html              # About page
├── affiliates.html         # Affiliate disclosure (CRITICAL)
├── privacy.html            # Privacy policy
├── terms.html              # Terms of use
├── manifest.json           # PWA manifest
├── service-worker.js       # Service worker (offline support)
├── assets/
│   ├── css/
│   │   └── styles.css      # Complete styling (responsive)
│   ├── js/
│   │   └── main.js         # Navigation, forms, analytics
│   └── images/             # (Future) Logo and screenshots
└── README.md               # This file
```

## 🚀 Quick Start

### Local Development

1. **Open in browser** (no server required):
   - Simply open `index.html` in your browser
   - All pages work with the `file://` protocol
   - JavaScript is fully functional

2. **With a local server** (optional):
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js (if installed)
   npx http-server
   ```
   Then visit: `http://localhost:8000/website/`

3. **Mobile preview**:
   - Open DevTools (F12)
   - Click "Toggle device toolbar" or press `Ctrl+Shift+M`
   - Test on iPhone, iPad, Android sizes

## 🌐 Deploy to GitHub Pages

### Option 1: Deploy Entire Repository

If you want to host the website at `https://username.github.io/stockspot/website/`:

```bash
# Push the website folder to GitHub
git add website/
git commit -m "Add StockSpot public website"
git push origin main

# In GitHub repo settings:
# Go to Settings > Pages
# Source: main branch / website folder
# Deploy
```

### Option 2: Deploy to Custom Domain

If you own a domain and want to host at `https://stockspot.com/`:

1. **Update GitHub Pages settings**:
   - Repository Settings > Pages
   - Source: main branch / website folder
   - Custom domain: `stockspot.com`

2. **Update DNS records** with your registrar:
   ```
   Type: A
   Name: @
   Value: 185.199.108.153
          185.199.109.153
          185.199.110.153
          185.199.111.153
   ```

3. **Wait for DNS propagation** (up to 24 hours)

4. **GitHub will auto-generate HTTPS certificate**

### Option 3: Deploy to Netlify (Recommended)

Netlify offers better features and faster deployment:

1. **Connect to GitHub**:
   - Go to netlify.com and sign up with GitHub
   - Select this repository
   - Build command: (leave empty)
   - Publish directory: `website`

2. **Deploy**:
   - Netlify automatically deploys on git push
   - Get free HTTPS certificate
   - Use custom domain if you own one

## 📄 Pages & Content

### index.html
Homepage with:
- Hero section with CTA buttons
- "How It Works" section (3 steps)
- Example deals (6 realistic examples)
- Email signup form (captures emails, logs to console)
- Trust/Why section
- Affiliate disclosure notice

### about.html
Explains:
- What StockSpot is
- Who it's for
- The problem it solves
- How it works
- Commitment to users (free, honest, private, simple)
- Future plans
- Contact info

### affiliates.html ⭐ CRITICAL
**Must include for Amazon Associates approval:**
- Clear Amazon Associates disclosure
- Plain language explanation of affiliate links
- How affiliates DON'T influence what we show
- List of affiliate programs
- Commitment to honesty
- Why we use affiliate revenue
- Resource links to FTC guidelines

### privacy.html
Covers:
- What information we collect (email, usage, device)
- How we use it
- What we explicitly DON'T do
- Data sharing practices
- User rights (unsubscribe, data access, deletion)
- Security measures
- CCPA rights for California residents

### terms.html
Includes:
- Use license restrictions
- Disclaimer of warranties
- Limitation of liability
- No guarantee of product availability
- Affiliate relationships
- Unsubscribe process
- Third-party link disclaimer

## 🎨 Design & Styling

### Features
- **Mobile-first**: Designed for small screens first, enhanced for larger
- **Responsive**: Works on all device sizes (320px - 4K+)
- **CSS Variables**: Easy color customization
- **No external dependencies**: Everything is inline or local
- **Accessibility**: WCAG compliant, keyboard navigation, screen reader friendly

### Color Palette
```css
--primary-color: #2563eb      /* Blue */
--accent-color: #10b981       /* Green */
--text-primary: #111827       /* Dark gray */
--text-secondary: #4b5563     /* Medium gray */
```

### Customize Colors
Edit `assets/css/styles.css` and change the CSS variables at the top:

```css
:root {
  --primary-color: #YOUR-HEX-HERE;
  --accent-color: #YOUR-HEX-HERE;
  /* etc */
}
```

## 🔧 JavaScript Functionality

### main.js Features

**Navigation**:
- Hamburger menu toggle on mobile
- Smooth closing when clicking links
- Click outside to close menu

**Email Form**:
- Validates email format
- Logs to console (console.log)
- Shows success/error messages
- Stores in localStorage for demo
- Developer tools:
  - `window.getSignupEmails()` - View collected emails
  - `window.clearSignupEmails()` - Clear data

**Animations**:
- Scroll-triggered fade-in effects
- Smooth scroll behavior
- Hover effects on buttons/cards

**PWA/Service Worker**:
- Registers service worker automatically
- Enables offline viewing
- Caches essential assets

## 📧 Email Form - Important Notes

**Current Implementation**:
- Form submits without network request (static-first)
- Email is logged to browser console
- Email is stored in localStorage (JavaScript)
- No backend connection yet

**Connect to Backend Later**:
```javascript
// In assets/js/main.js, replace this section:
async function handleEmailSubmit(e) {
  // ... validation code ...
  
  // Send to backend
  const response = await fetch('https://backend.example.com/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  
  // ... handle response ...
}
```

## ✅ Amazon Associates Compliance Checklist

- ✅ Clear affiliate disclosure on dedicated page
- ✅ Affiliate disclosure also in privacy policy
- ✅ Affiliate disclosure in footer notice
- ✅ No fake testimonials
- ✅ No misleading earnings claims
- ✅ No countdown timers or pressure tactics
- ✅ No Amazon logos or trademark misuse
- ✅ No shortened affiliate links (only direct links)
- ✅ Clear CTA buttons (not trying to trick)
- ✅ Honest tone throughout
- ✅ Real example deals (not fake)
- ✅ Privacy policy is transparent
- ✅ Terms of use properly disclaim guarantees
- ✅ Contact info provided (support@stockspotdeals.com)

## 🔐 Privacy & Data

**What we collect from the website**:
- Email addresses (from signup form)
- Page visits (via analytics if added)
- Device type (from User-Agent)

**What we DON'T do**:
- No tracking pixels
- No ad cookies
- No Google Analytics (privacy-first)
- No email selling
- No data sharing

See `privacy.html` for complete policy.

## 📱 PWA Installation

Users can install StockSpot as an app on:
- **Android**: Chrome browser → 3-dot menu → "Install app"
- **iPhone/iPad**: Safari → Share button → "Add to Home Screen"
- **Desktop**: Chrome address bar → Install icon

The manifest.json and service-worker.js make this possible.

## 🧪 Testing Checklist

- [ ] Open index.html directly in browser (works offline)
- [ ] Test responsive design (mobile/tablet/desktop)
- [ ] Test hamburger menu (mobile)
- [ ] Submit email form (check console for log)
- [ ] Test all links navigate correctly
- [ ] Click footer links (privacy, terms, etc)
- [ ] Test smooth scrolling (anchor links)
- [ ] Verify affiliate disclosure is visible
- [ ] Check page load speed (should be < 1 second)
- [ ] Test in incognito mode (no cache interference)
- [ ] Test keyboard navigation (Tab through page)
- [ ] Check on multiple browsers (Chrome, Firefox, Safari)
- [ ] Verify colors are accessible (WCAG AA standard)

## 🔄 Future Enhancements

1. **Backend Connection**:
   - Connect email form to MongoDB
   - Verify emails via double opt-in
   - Store subscriber preferences

2. **More Pages**:
   - Blog (deal trends, shopping tips)
   - FAQ (common questions)
   - Changelog (feature updates)

3. **Email Templates**:
   - Transactional emails (welcome, unsubscribe)
   - Weekly digest email templates
   - Category-specific email layouts

4. **Analytics**:
   - Privacy-respecting analytics (Plausible, Fathom)
   - Track deal click-through rates
   - Monitor popular categories

5. **Content**:
   - Testimonials from real users
   - Deal statistics (how many users found items)
   - Success stories (screenshots of purchases)

6. **Mobile App**:
   - React Native or Flutter app
   - Push notifications
   - Advanced filtering
   - Wishlist features

## 📞 Support & Questions

**For website issues:**
- Email: support@stockspotdeals.com
- Subject: "Website Bug - [describe issue]"

**For deployment help:**
- See "Deploy to GitHub Pages" section above
- Check GitHub Pages documentation: https://pages.github.com/

## 📄 License

This website is part of the StockSpot project. All rights reserved.

## 🎯 Quick Links

- **Live Site**: https://stockspot.example.com (replace with your domain)
- **GitHub Repo**: https://github.com/username/stockspot
- **Backend API**: (Coming soon) https://api.stockspot.example.com
- **Support Email**: support@stockspotdeals.com

---

**Built for deal hunters, by deal hunters.**
