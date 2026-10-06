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

// ⭐ RAW BODY FOR WEBHOOK
app.use("/webhook", express.raw({ type: "application/json" }));

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
    // ⭐ You forgot this line — this is why items was undefined
    const { items, customerEmail, tipAmount } = req.body;

    const line_items = items.map(item => ({
      price_data: {
        currency: "gbp",
        product_data: {
          name: item.name,
          tax_code: "txcd_20030000",   // Mark as physical product
          metadata: {
            printfulVariantId: String(item.variant_id)
          }
        },
        unit_amount: item.price
      },
      quantity: item.quantity
    }));

    // ⭐ ADD TIP (only if present)
    if (tipAmount && tipAmount > 0) {
      line_items.push({
        price_data: {
          currency: "gbp",
          product_data: {
            name: "Tip NIC ❤️",
            tax_code: "txcd_99999999",   // Mark tip as service
            metadata: { isTip: "true" }
          },
          unit_amount: tipAmount
        },
        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: customerEmail,

      shipping_address_collection: {
        allowed_countries: ["GB"]
      },

      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 0, currency: "gbp" },
            display_name: "Free Shipping",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 5 }
            }
          }
        }
      ],

      billing_address_collection: "required",
      line_items,
      success_url: "https://nicsteps-frontend.netlify.app/success.html",
      cancel_url: "https://nicsteps-frontend.netlify.app/cancel.html"
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    res.status(500).json({ error: "Stripe session failed" });
  }
});

// ⭐ PRINTFUL ORDER ROUTE
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
          name: item.variant_name || item.product?.name || "NICSTEPS Product",
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
      const session = event.data.object;

      console.log("SHIPPING DETAILS:", session.shipping_details);

      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
        {
          limit: 100,
          expand: ["data.price.product"]
        }
      );

      console.log("Payment completed:", session.id);

      // ⭐ Build Printful items
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
        name: shipping?.name || session.customer_details?.name || "NICSTEPS Customer",
        email: session.customer_email,
        address1: shipping?.address?.line1 || "123 Test Street",
        city: shipping?.address?.city || "London",
        zip: shipping?.address?.postal_code || "SW1A 1AA",
        country_code: shipping?.address?.country || "GB"
      };

      if (shipping?.address?.state) {
        recipient.state_code = shipping.address.state;
      }

      // ⭐ Create Printful order
      const printfulOrder = await fetch("https://api.printful.com/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
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

      // ⭐ Fetch full Printful order
      const fullOrderResponse = await fetch(
        `https://api.printful.com/orders/${printfulData.result.id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
            "X-PF-Store-Id": "18797480"
          }
        }
      );

      const fullOrder = await fullOrderResponse.json();

      // ⭐ Build email items
      const PRODUCTS = {
        "Multicam Black": {
          image: "images/multicam-black.png",
          variants: { "S/M": 15897, "L/XL": 15898 }
        },
        "Dark Navy": {
          image: "images/dark-navy.png",
          variants: { "S/M": 5278, "L/XL": 5279 }
        },
        "Black": {
          image: "images/black.png",
          variants: { "S/M": 5276, "L/XL": 5277 }
        },
        "Royal Blue": {
          image: "images/royal-blue.png",
          variants: { "S/M": 5286, "L/XL": 5287 }
        },
        "Red": {
          image: "images/red.png",
          variants: { "S/M": 5288, "L/XL": 5289 }
        },
        "Olive": {
          image: "images/olive.png",
          variants: { "S/M": 15901, "L/XL": 15902 }
        },
        "Dark Grey": {
          image: "images/dark-grey.png",
          variants: { "S/M": 5280, "L/XL": 5281 }
        },
        "Khaki": {
          image: "images/khaki.png",
          variants: { "S/M": 5292, "L/XL": 5293 }
        },
        "White": {
          image: "images/white.png",
          variants: { "S/M": 5274, "L/XL": 5275 }
        }
      };

      const variantIdToColor = {};
      for (const color in PRODUCTS) {
        const variants = PRODUCTS[color].variants;
        for (const size in variants) {
          variantIdToColor[variants[size]] = color;
        }
      }

      const imageMap = {
        "Multicam Black": "multicam-black.png",
        "Dark Navy": "dark-navy.png",
        "Royal Blue": "royal-blue.png",
        "Olive": "olive.png",
        "Red": "red.png",
        "Khaki": "khaki.png",
        "Dark Grey": "dark-grey.png",
        "Black": "black.png",
        "White": "white.png"
      };

      const emailItems = fullOrder.result.items.map(item => {
        const variantId = item.variant_id;
        const variantName = variantIdToColor[variantId];

        return {
          name: item.product?.name || "NICSTEPS Product",
          description: variantName || "Custom Embroidery",
          quantity: item.quantity,
          price: item.retail_price || session.amount_total / 100,
          image: `https://nicsteps-frontend.netlify.app/images/${imageMap[variantName] || "default.png"}`
        };
      });

      const order = {
        customerName: recipient.name,
        email: session.customer_email,
        orderNumber: `NIC-${Math.floor(Math.random() * 1000000)}`,
        orderDate: new Date().toLocaleDateString(),
        items: emailItems,
        subtotal: session.amount_subtotal / 100,
        shipping: session.total_details.amount_shipping / 100,
        total: session.amount_total / 100,
        shippingAddress: `${recipient.address1}, ${recipient.city}, ${recipient.zip}, ${recipient.country_code}`
      };

      await sendOrderConfirmation(order);
      console.log("Email sent automatically via webhook.");

    } catch (err) {
      console.error("Webhook handler error:", err);
      return res.status(500).send("Webhook handler failed");
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
