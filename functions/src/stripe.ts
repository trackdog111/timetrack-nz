import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover'
});

// Webhook signing secret - set via: firebase functions:config:set stripe.webhook_secret="whsec_..."


const db = admin.firestore();

/**
 * Create Stripe Checkout Session
 * Called from the dashboard when user clicks "Add Payment"
 */
export const stripeCreateCheckout = functions
  .region('australia-southeast1')
  .https.onRequest(async (req, res) => {
    // Handle CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const { priceId, companyId, customerEmail, successUrl, cancelUrl } = req.body;

      if (!priceId || !companyId || !customerEmail) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      // Create Stripe Checkout Session
      const session = await getStripe().checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: customerEmail,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        metadata: {
          companyId: companyId,
        },
        success_url: successUrl || 'https://dashboard.trackable.co.nz?stripe=success',
        cancel_url: cancelUrl || 'https://dashboard.trackable.co.nz?stripe=cancel',
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({ error: error.message });
    }
  });

/**
 * Stripe Webhook Handler
 * Receives events from Stripe and updates Firestore accordingly
 */
export const stripeWebhook = functions
  .region('australia-southeast1')
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const sig = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = getStripe().webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    console.log('Received Stripe event:', event.type);

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const companyId = session.metadata?.companyId;
          
          if (companyId) {
            // Update company status to active
            await db.collection('companies').doc(companyId).update({
              status: 'active',
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              activatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Company ${companyId} activated via checkout`);
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          
          // Find company by stripeCustomerId
          const companiesSnap = await db.collection('companies')
            .where('stripeCustomerId', '==', subscription.customer)
            .limit(1)
            .get();
          
          if (!companiesSnap.empty) {
            const companyDoc = companiesSnap.docs[0];
            const status = subscription.status === 'active' ? 'active' : 
                          subscription.status === 'past_due' ? 'past_due' : 
                          subscription.status === 'canceled' ? 'canceled' : 'trial';
            
            await companyDoc.ref.update({
              status,
              stripeSubscriptionStatus: subscription.status,
            });
            console.log(`Company ${companyDoc.id} subscription updated to ${status}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          
          // Find company by stripeCustomerId
          const companiesSnap = await db.collection('companies')
            .where('stripeCustomerId', '==', subscription.customer)
            .limit(1)
            .get();
          
          if (!companiesSnap.empty) {
            const companyDoc = companiesSnap.docs[0];
            await companyDoc.ref.update({
              status: 'canceled',
              stripeSubscriptionStatus: 'canceled',
              canceledAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Company ${companyDoc.id} subscription canceled`);
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          
          // Find company by stripeCustomerId
          const companiesSnap = await db.collection('companies')
            .where('stripeCustomerId', '==', invoice.customer)
            .limit(1)
            .get();
          
          if (!companiesSnap.empty) {
            const companyDoc = companiesSnap.docs[0];
            await companyDoc.ref.update({
              status: 'past_due',
              lastPaymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Company ${companyDoc.id} payment failed`);
          }
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          
          // Find company by stripeCustomerId (only for subscription invoices)
          if ((invoice as any).subscription) {
            const companiesSnap = await db.collection('companies')
              .where('stripeCustomerId', '==', invoice.customer)
              .limit(1)
              .get();
            
            if (!companiesSnap.empty) {
              const companyDoc = companiesSnap.docs[0];
              await companyDoc.ref.update({
                status: 'active',
                lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              console.log(`Company ${companyDoc.id} payment succeeded`);
            }
          }
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: error.message });
    }
  });