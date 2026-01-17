/**
 * StripeManager - Payment Processing & Subscription Management
 * 
 * Handles:
 * - Checkout session creation
 * - Subscription lifecycle
 * - Webhook verification
 * - Tier upgrades/downgrades
 * - Refund handling
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { UserModel } = require('../models/User');
const crypto = require('crypto');

class StripeManager {
  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(userId, tier, returnUrl) {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const priceId = this.getPriceIdForTier(tier);
      if (!priceId) {
        throw new Error(`Invalid tier: ${tier}`);
      }

      const session = await stripe.checkout.sessions.create({
        customer_email: user.email,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: returnUrl,
        client_reference_id: userId.toString(),
        metadata: {
          userId: userId.toString(),
          tier: tier,
        },
      });

      console.log(`✅ Checkout session created for ${user.email} (${tier})`);
      return session;
    } catch (error) {
      console.error('❌ Checkout session error:', error.message);
      throw error;
    }
  }

  /**
   * Get price ID for tier
   */
  getPriceIdForTier(tier) {
    const tiers = {
      'PAID': process.env.STRIPE_PRICE_MONTHLY_ID,
      'YEARLY': process.env.STRIPE_PRICE_YEARLY_ID,
    };
    return tiers[tier];
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(body, signature) {
    try {
      // Verify webhook signature
      const event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      console.log(`📨 Webhook received: ${event.type}`);

      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutComplete(event.data.object);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdate(event.data.object);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionCancelled(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object);
          break;

        default:
          console.log(`ℹ️  Unhandled event type: ${event.type}`);
      }

      return { received: true };
    } catch (error) {
      console.error('❌ Webhook processing error:', error.message);
      throw error;
    }
  }

  /**
   * Handle successful checkout
   */
  async handleCheckoutComplete(session) {
    try {
      const userId = session.client_reference_id;
      const tier = session.metadata.tier;
      const subscription = await stripe.subscriptions.retrieve(session.subscription);

      const user = await UserModel.findByIdAndUpdate(
        userId,
        {
          subscriptionTier: tier,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: subscription.id,
          subscriptionActive: true,
          subscriptionStartDate: new Date(subscription.current_period_start * 1000),
          subscriptionEndDate: new Date(subscription.current_period_end * 1000),
        },
        { new: true }
      );

      console.log(`✅ Subscription activated for ${user.email} (${tier})`);

      // Send confirmation email
      await this.sendSubscriptionConfirmation(user, tier);

      return user;
    } catch (error) {
      console.error('❌ Checkout completion error:', error.message);
      throw error;
    }
  }

  /**
   * Handle subscription updated (e.g., plan change)
   */
  async handleSubscriptionUpdate(subscription) {
    try {
      const user = await UserModel.findOne({
        stripeSubscriptionId: subscription.id,
      });

      if (!user) {
        console.warn(`⚠️  No user found for subscription ${subscription.id}`);
        return;
      }

      // Determine new tier from price ID
      const newTier = this.getTierFromPriceId(subscription.items.data[0].price.id);

      user.subscriptionTier = newTier;
      user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
      await user.save();

      console.log(`✅ Subscription updated for ${user.email}: ${newTier}`);
    } catch (error) {
      console.error('❌ Subscription update error:', error.message);
    }
  }

  /**
   * Handle subscription cancelled
   */
  async handleSubscriptionCancelled(subscription) {
    try {
      const user = await UserModel.findOne({
        stripeSubscriptionId: subscription.id,
      });

      if (!user) {
        console.warn(`⚠️  No user found for subscription ${subscription.id}`);
        return;
      }

      user.subscriptionTier = 'FREE';
      user.subscriptionActive = false;
      user.subscriptionEndDate = new Date(subscription.ended_at * 1000);
      await user.save();

      console.log(`ℹ️  Subscription cancelled for ${user.email}`);

      // Send cancellation email
      await this.sendCancellationConfirmation(user);
    } catch (error) {
      console.error('❌ Subscription cancellation error:', error.message);
    }
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSuccess(invoice) {
    try {
      const customer = await stripe.customers.retrieve(invoice.customer);
      const user = await UserModel.findOne({
        email: customer.email,
      });

      if (user) {
        console.log(`✅ Payment succeeded for ${user.email}`);
        // Additional processing (e.g., logging, analytics)
      }
    } catch (error) {
      console.error('❌ Payment success handling error:', error.message);
    }
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailed(invoice) {
    try {
      const customer = await stripe.customers.retrieve(invoice.customer);
      const user = await UserModel.findOne({
        email: customer.email,
      });

      if (user) {
        console.log(`⚠️  Payment failed for ${user.email}`);
        await this.sendPaymentFailedNotification(user);
      }
    } catch (error) {
      console.error('❌ Payment failure handling error:', error.message);
    }
  }

  /**
   * Get tier from price ID
   */
  getTierFromPriceId(priceId) {
    if (priceId === process.env.STRIPE_PRICE_MONTHLY_ID) {
      return 'PAID';
    }
    if (priceId === process.env.STRIPE_PRICE_YEARLY_ID) {
      return 'YEARLY';
    }
    return 'FREE';
  }

  /**
   * Get subscription status
   */
  async getSubscriptionStatus(userId) {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.stripeSubscriptionId) {
        return {
          tier: 'FREE',
          status: 'free',
          active: false,
        };
      }

      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

      return {
        tier: user.subscriptionTier,
        status: subscription.status,
        active: subscription.status === 'active',
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
      };
    } catch (error) {
      console.error('❌ Subscription status error:', error.message);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId) {
    try {
      const user = await UserModel.findById(userId);
      if (!user || !user.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      const subscription = await stripe.subscriptions.del(user.stripeSubscriptionId);
      console.log(`✅ Subscription cancelled for ${user.email}`);

      return subscription;
    } catch (error) {
      console.error('❌ Subscription cancellation error:', error.message);
      throw error;
    }
  }

  /**
   * Send subscription confirmation email
   */
  async sendSubscriptionConfirmation(user, tier) {
    // Integration with email service
    console.log(`📧 Sending subscription confirmation to ${user.email}`);
    // Implementation depends on email provider (SendGrid/Nodemailer)
  }

  /**
   * Send cancellation confirmation email
   */
  async sendCancellationConfirmation(user) {
    console.log(`📧 Sending cancellation confirmation to ${user.email}`);
  }

  /**
   * Send payment failed notification
   */
  async sendPaymentFailedNotification(user) {
    console.log(`📧 Sending payment failure notification to ${user.email}`);
  }
}

module.exports = { StripeManager };
