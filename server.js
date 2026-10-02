import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import { sendOrderConfirmation } from "./sendEmail.js";

dotenv.config();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();

// ⭐ IMPORTANT: Stripe webhook needs RAW body
app.use(
  "/webhook",
  express.raw({ type: "application/json" })
);

// Normal JSON for everything else
app.use(express.json());

app.use(
  cors({
    origin: [
      "https://nicsteps-frontend.netlify.app",
      "https://nicsteps.co.uk"
    ],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.static("public"));

// TEST ROUTE
app.get("/", (req, res) => {
  res.send("Vigo API is running");
});


// ⭐ STRIPE CHECKOUT SESSION ROUTE
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items, customerEmail } = req.body;

    const line_items = items.map(item => ({
      price_data: {
        currency: "gbp",
        product_data: {
          name: item.name,
          metadata: {
            printfulVariantId: String(item.variant_id)
          }
        },
        unit_amount: item.price   // already in pence from frontend
      },
      quantity: item.quantity
    }));

const session = await stripe.checkout.sessions.create({
  payment_method_types: ["card"],
  mode: "payment",
  customer_email: customerEmail,

  // ⭐ REQUIRED FIX
  billing_address_collection: "required",

  shipping_address_collection: {
    allowed_countries: ['GB']
  },

  line_items,
  success_url: "https://nicsteps-frontend.netlify.app/success.html",
  cancel_url: "https://nicsteps-frontend.netlify.app/cancel.html",
});

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    res.status(500).json({ error: "Stripe session failed" });
  }
});

// ⭐ PRINTFUL ORDER ROUTE (manual order creation)
app.post("/create-order", async (req, res) => {
  try {
    const orderData = req.body;

    const response = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
        "X-PF-Store-Id": "18797480",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...orderData, confirm: true }),
    });

    const data = await response.json();

    if (data.code === 200 && data.result?.id) {
      const emailOrder = {
        customerName: orderData.recipient.name,
        email: orderData.recipient.email,
        orderNumber: data.result.id,
        orderDate: new Date().toLocaleDateString(),
        items: data.result.items.map((item) => ({
        name: item.name,
        description: `${item.variant_name || ""} ${item.options ? item.options.join(", ") : ""}`.trim(),
        quantity: item.quantity,
        price: item.price,
        })),
        subtotal: data.result.costs.subtotal,
        shipping: data.result.costs.shipping,
        total: data.result.costs.total,
        shippingAddress: `${orderData.recipient.address1}, ${orderData.recipient.city}, ${orderData.recipient.zip}, ${orderData.recipient.country_code}`,
      };

      await sendOrderConfirmation(emailOrder);

      return res.json({ success: true, orderId: data.result.id });
    }

    return res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ⭐ TEST EMAIL ROUTE
app.get("/test-email", async (req, res) => {
  const order = {
    customerName: "Vigo",
    email: "weathergoals@gmail.com",
    orderNumber: "TEST123",
    orderDate: new Date().toLocaleDateString(),
    items: [
      { name: "NICSTEPS Shoes", quantity: 1, price: 49.99 },
      { name: "Laces", quantity: 1, price: 4.99 },
    ],
    subtotal: 54.98,
    shipping: 3.99,
    total: 58.97,
    shippingAddress: "123 Test Street, Peterlee",
  };

  try {
    await sendOrderConfirmation(order);
    res.send("Test email sent.");
  } catch (err) {
    console.error("Test email failed:", err);
    res.status(500).send("Email failed.");
  }
});

// ⭐ STRIPE WEBHOOK ROUTE
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
  try {
    // 1. Retrieve the session (basic)
    const session = await stripe.checkout.sessions.retrieve(event.data.object.id);

    // 2. Retrieve ALL line items (up to 100)
    const lineItems = await stripe.checkout.sessions.listLineItems(
  event.data.object.id,
  {
    limit: 100,
    expand: ["data.price.product"]
  }
);

    console.log("Payment completed:", session.id);

    // Build Printful items from ALL line items
    const printfulItems = lineItems.data.map(item => ({
      variant_id: Number(item.price.product.metadata.printfulVariantId),
      quantity: item.quantity,
      files: [{ id: 1072375296 }],
      options: [
        { id: "thread_colors", value: ["#FFFFFF"] }
      ]
    }));

    const shipping = session.shipping_details;

    const recipient = {
      name: session.customer_details?.name || shipping?.name || "NICSTEPS Customer",
      email: session.customer_email,
      address1: shipping?.address?.line1 || "123 Test Street",
      city: shipping?.address?.city || "London",
      zip: shipping?.address?.postal_code || "SW1A 1AA",
      country_code: shipping?.address?.country || "GB"
    };

    if (shipping?.address?.state) {
      recipient.state_code = shipping.address.state;
    }

    const printfulOrder = await fetch("https://api.printful.com/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.PRINTFUL_API_KEY}`,
        "X-PF-Store-Id": "18797480",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        confirm: true,
        recipient,
        items: printfulItems
      })
    });

    const printfulData = await printfulOrder.json();
    console.log("Printful order created:", printfulData);

    // Send confirmation email
    const order = {
      customerName: recipient.name,
      email: session.customer_email,
      orderNumber: `NIC-${Math.floor(Math.random() * 1000000)}`,
      orderDate: new Date().toLocaleDateString(),
      items: printfulItems,
      subtotal: session.amount_subtotal / 100,
      shipping: session.total_details.amount_shipping / 100,
      total: session.amount_total / 100,
      shippingAddress: `${recipient.address1}, ${recipient.city}, ${recipient.zip}, ${recipient.country_code}`
    };

    await sendOrderConfirmation(order);
    console.log("Email sent automatically via webhook.");

  } catch (err) {
    console.error("Webhook handler error:", err);
  }
}

  res.json({ received: true });
});

// ⭐ DEBUG ROUTE TO FETCH PRINTFUL PRODUCT DETAILS
app.get("/debug-cap/:id", async (req, res) => {
  const productId = req.params.id;
  try {
    const response = await fetch(`https://api.printful.com/store/products/${productId}`, {
      headers: {
        Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
       "X-PF-Store-Id": process.env.PRINTFUL_STORE_ID,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// START SERVER
app.listen(3000, () => {
  console.log("Vigo backend running on http://localhost:3000");
});
