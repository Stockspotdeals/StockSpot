# Stripe Webhook System - StockSpot Backend

## Overview
Stripe webhook system implemented to verify payments and enforce subscription access using MongoDB.

## Modified Files

### 1. **backend/app.js**
- Added Stripe instance initialization: `const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);`
- Added `/stripe/webhook` endpoint (POST)
  - Uses `express.raw()` middleware to handle raw webhook body
  - Verifies webhook signature with `stripe.webhooks.constructEvent()`
  - Handles `checkout.session.completed` event: updates MongoDB user with `subscriptionStatus: 'active'`
  - Handles `customer.subscription.deleted` event: sets `subscriptionStatus: 'inactive'`

### 2. **backend/middleware/requirePremium.js**
- Updated to check MongoDB subscription status instead of headers
- Now async middleware that looks up user by ID
- Verifies `user.subscriptionStatus === 'active'`
- Returns 403 Forbidden if subscription not active
- Integrates with existing auth middleware (requires `req.user.id`)

### 3. **backend/models/User.js**
- Added Stripe fields to User model:
  - `subscriptionStatus`: 'active' | 'inactive'
  - `stripeCustomerId`: Stripe customer ID
  - `subscriptionStartDate`: Date subscription started
  - `subscriptionEndDate`: Date subscription ends
- Updated `toJSON()` to include subscription fields

## Environment Variables Required (Render)

Add these to Render environment settings:

```
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
STRIPE_PRICE_MONTHLY_ID=price_YOUR_MONTHLY_PRICE_ID
STRIPE_PRICE_YEARLY_ID=price_YOUR_YEARLY_PRICE_ID
```

### Getting Values

1. **STRIPE_SECRET_KEY**: Stripe Dashboard → Developers → API Keys → Secret Key
2. **STRIPE_WEBHOOK_SECRET**: 
   - Go to Developers → Webhooks
   - Add endpoint: `https://your-render-domain.com/stripe/webhook`
   - Select events: `checkout.session.completed`, `customer.subscription.deleted`
   - Copy signing secret
3. **STRIPE_PRICE_IDS**: Stripe Dashboard → Billing → Products → Create/View Price IDs

## Webhook Flow

```
User initiates Stripe checkout
    ↓
Payment successful
    ↓
Stripe sends webhook to /stripe/webhook
    ↓
Webhook signature verified
    ↓
MongoDB User record updated:
    - subscriptionStatus = 'active'
    - stripeCustomerId = customer_id
    - subscriptionStartDate = now
    ↓
Premium routes (using requirePremium middleware) now accessible
```

## Protected Routes

Any route using `requirePremium` middleware now requires active Stripe subscription:

```javascript
router.post('/api/ai/generate-flip-template', requirePremium, (req, res) => {
  // Only accessible with active subscription
});
```

## Testing Locally

1. Set environment variables:
   ```powershell
   $env:STRIPE_SECRET_KEY = 'sk_test_xxx'
   $env:STRIPE_WEBHOOK_SECRET = 'whsec_xxx'
   ```

2. Run server:
   ```bash
   node server.js
   ```

3. Test webhook endpoint with curl or Postman:
   ```bash
   POST http://localhost:3000/stripe/webhook
   Headers: stripe-signature: test_sig
   Body: { "type": "checkout.session.completed", "data": { "object": { ... } } }
   ```

## Existing API Structure Preserved

✅ All existing routes remain unchanged
✅ MongoDB connection unaffected
✅ No breaking changes to frontend integration
✅ Gradual rollout: only protected routes require subscription

## Next Steps for Production

1. Get Stripe test/live keys from Stripe Dashboard
2. Configure webhook endpoint in Stripe Dashboard
3. Add environment variables to Render
4. Monitor webhook logs in Stripe Dashboard
5. Deploy to Render: `git push origin main`
