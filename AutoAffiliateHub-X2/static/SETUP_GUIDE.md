# AutoAffiliateHub-X2 Static Assets Setup Guide

## 📁 Files Generated

### 1. `/static/style.css` - TailwindCSS Source
Complete TailwindCSS source file with:
- **Inter font** import for body text
- **Gray-100 background** for body
- **Bold headings** styling
- **Button components** with blue background, white text, hover effects, rounded corners
- **Table styling** with borders, padding, and rounded corners
- **Form inputs/selects/textareas** with focus ring styling
- **Link styling** with blue color and hover underline
- **Custom components** for cards, alerts, and dashboard elements

### 2. `/tailwind.config.js` - TailwindCSS Configuration
Simplified configuration with:
- **Content scanning** from './templates/**/*.html'
- **Default theme** with no extensions
- **No plugins** required
- **Clear comments** for setup instructions

### 3. `/static/logo-generator.html` - Logo Creation Tool
HTML tool to generate the 200x200px PNG logo:
- **Blue background** (#3B82F6)
- **Chain link icon** with arrow
- **AutoAffiliate Hub X2** branding
- **Canvas-based PNG export**

## 🚀 Setup Instructions

### 1. Install TailwindCSS
```bash
# Install TailwindCSS globally or locally
npm install -g tailwindcss

# Or install locally in project
npm install -D tailwindcss
```

### 2. Compile CSS Files
```bash
# Development mode with watch (recommended during development)
npx tailwindcss -i ./static/style.css -o ./static/output.css --watch

# Production build (minified for deployment)
npx tailwindcss -i ./static/style.css -o ./static/output.css --minify
```

### 3. Generate Logo
1. Open `/static/logo-generator.html` in your browser
2. Click "Generate PNG (Canvas)" button to download `logo.png`
3. Save the downloaded file as `/static/logo.png`

### 4. Update HTML Templates
In your HTML templates, include the compiled CSS:
```html
<link rel="stylesheet" href="{{ url_for('static', filename='output.css') }}">
```

## 🎨 Custom Branding Components

### Button Classes
```html
<button class="btn-primary">Primary Action</button>
<button class="btn-secondary">Secondary Action</button>
<button class="btn-success">Success Action</button>
<button class="btn-danger">Danger Action</button>
```

### Table Styling
```html
<table class="table-styled">
    <thead>
        <tr>
            <th>Header</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>Data</td>
        </tr>
    </tbody>
</table>
```

### Form Elements
```html
<input type="text" class="form-input" placeholder="Enter text">
<select class="form-select">
    <option>Choose option</option>
</select>
<textarea class="form-textarea" placeholder="Enter message"></textarea>
```

### Links
```html
<a href="#" class="link">Blue link with hover underline</a>
```

### Cards
```html
<div class="card">
    <div class="card-header">
        <h3>Card Title</h3>
    </div>
    <div class="card-body">
        Card content goes here
    </div>
</div>
```

### Alerts
```html
<div class="alert alert-success">Success message</div>
<div class="alert alert-warning">Warning message</div>
<div class="alert alert-danger">Error message</div>
<div class="alert alert-info">Info message</div>
```

## 📋 Typography & Colors

### Body Font
- **Font Family**: 'Inter', sans-serif
- **Background**: gray-100 (#f3f4f6)
- **Text Color**: gray-900 (#111827)

### Headings
- **Font Weight**: 700 (bold)
- **Color**: gray-900 (#111827)

### Button Colors
- **Primary**: blue-600 (#2563eb) with blue-700 hover
- **Secondary**: gray-600 (#4b5563) with gray-700 hover
- **Success**: green-600 (#16a34a) with green-700 hover
- **Danger**: red-600 (#dc2626) with red-700 hover

### Focus States
- **Focus Ring**: 2px blue-500 (#3b82f6) with 2px offset

## 🔧 Template Integration

All dashboard templates are compatible with these styles:
- `layout.html` - Base template with Inter font and gray-100 background
- `overview.html` - Uses card, btn-primary, and alert components  
- `queue.html` - Uses table-styled and form components
- `history.html` - Uses table-styled and link components
- `settings.html` - Uses form-input, form-select, and btn-primary
- `login.html` - Uses form-input and btn-primary components

## 📝 Notes

- **TailwindCSS errors** in IDE are expected (directives not recognized by linter)
- **Always compile** before testing in browser
- **Use output.css** in production, not source style.css
- **Logo generator** works in modern browsers with Canvas support
- **All components** follow accessibility best practices with focus states

## 🚀 Production Checklist

- [ ] Install TailwindCSS
- [ ] Compile style.css to output.css
- [ ] Generate and save logo.png
- [ ] Update templates to use output.css
- [ ] Test all components in browser
- [ ] Minify CSS for production deployment