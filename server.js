import challengeRoutes from "./routes/challenge.js";
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import { sendOrderConfirmation } from "./sendEmail.js";
import { createHash } from "node:crypto";

dotenv.config({ override: true });

const requiredEnv = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PRINTFUL_API_KEY",
  "PRINTFUL_STORE_ID"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.warn(`Missing environment variable: ${key}`);
  }
}

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_not_configured"
);

const app = express();
const PORT = Number(process.env.PORT || 3000);

const FRONTEND_BASE_URL = (
  process.env.FRONTEND_BASE_URL ||
  "https://nicsteps-frontend.netlify.app"
).replace(/\/$/, "");

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500,https://nicsteps-frontend.netlify.app,https://nicsteps.co.uk"
)
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

// --------------------------------------------------
// PRODUCT VARIANT CATALOGUE
// Each Printful variant ID identifies its colour
// and size. Prices are controlled by this backend.
// --------------------------------------------------

const VARIANTS = {};

function addVariantGroup({
  productId,
  name,
  color,
  ids,
  sizes,
  pricePence,
  imagePath
}) {
  if (ids.length !== sizes.length) {
    throw new Error(
      `Variant ID/size mismatch for ${name} - ${color}`
    );
  }

  ids.forEach((id, index) => {
    const key = String(id);

    if (VARIANTS[key]) {
      throw new Error(`Duplicate Printful variant ID: ${key}`);
    }

    VARIANTS[key] = {
      productId,
      name,
      color,
      size: sizes[index],
      pricePence,
      imagePath
    };
  });
}

const CAP_SIZES = ["S/M", "L/XL"];
const CLOTHING_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];
const HOODIE_SIZES = ["S", "M", "L", "XL", "2XL"];
const ONE_SIZE = ["One Size"];

// Caps
const capColors = [
  ["Multicam Black", [15897, 15898], "multicam-black.png"],
  ["Dark Navy", [5278, 5279], "dark-navy.png"],
  ["Black", [5276, 5277], "black.png"],
  ["Royal Blue", [5286, 5287], "royal-blue.png"],
  ["Red", [5288, 5289], "red.png"],
  ["Olive", [15901, 15902], "olive.png"],
  ["Dark Grey", [5280, 5281], "dark-grey.png"],
  ["Khaki", [5292, 5293], "khaki.png"],
  ["White", [5274, 5275], "white.png"]
];

for (const [color, ids, image] of capColors) {
  addVariantGroup({
    productId: "cap",
    name: "NICSTEPS Flexfit Cap",
    color,
    ids,
    sizes: CAP_SIZES,
    pricePence: 3499,
    imagePath: `images/${image}`
  });
}

// Unisex Premium Pullover Hoodie
const hoodie10kColors = [
  ["Black", [10779, 10780, 10781, 10782, 10783, 13416], "10k-black.png"],
  ["Navy Blazer", [11491, 11492, 11493, 11494, 11495, 13417], "10k-navy.png"],
  ["Military Green", [13893, 13894, 13895, 13896, 13897, 13898], "10k-military-green.png"],
  ["Team Red", [20278, 20279, 20280, 20281, 20282, 20283], "10k-red.png"],
  ["Carbon Grey", [10784, 10785, 10786, 10787, 10788, 13420], "10k-carbon-grey.png"],
  ["Bone", [20284, 20285, 20286, 20287, 20288, 20289], "10k-bone.png"],
  ["White", [10774, 10775, 10776, 10777, 10778, 13421], "10k-white.png"]
];

for (const [color, ids, image] of hoodie10kColors) {
  addVariantGroup({
    productId: "10k-hoodie",
    name: "Unisex Premium Pullover Hoodie",
    color,
    ids,
    sizes: CLOTHING_SIZES,
    pricePence: 5740,
    imagePath: `images/${image}`
  });
}

// Premium Sweatshirt
const sweatshirtColors = [
  ["Black", [11254, 11255, 11256, 11257, 11258, 13258], "sweatshirt-black.png"],
  ["Navy Blazer", [13252, 13253, 13254, 13255, 13256, 13257], "sweatshirt-navy.png"],
  ["Charcoal Heather", [11259, 11260, 11261, 11262, 11263, 13260], "sweatshirt-charcoal.png"],
  ["Forest Green", [16156, 16157, 16158, 16159, 16160, 16161], "sweatshirt-green.png"],
  ["Team Red", [20369, 20368, 20367, 20366, 20365, 20364], "sweatshirt-red.png"],
  ["Khaki", [25556, 25557, 25558, 25559, 25560, 25561], "sweatshirt-khaki.png"],
  ["Carbon Grey", [11244, 11245, 11246, 11247, 11248, 13259], "sweatshirt-carbon.png"],
  ["Light Pink", [25544, 25545, 25546, 25547, 25548, 25549], "sweatshirt-pink.png"],
  ["Bone", [20357, 20356, 20355, 20354, 20353, 20352], "sweatshirt-bone.png"],
  ["Sky Blue", [25538, 25539, 25540, 25541, 25542, 25543], "sweatshirt-skyblue.png"],
  ["White", [11249, 11250, 11251, 11252, 11253, 13261], "sweatshirt-white.png"]
];

for (const [color, ids, image] of sweatshirtColors) {
  addVariantGroup({
    productId: "premium-sweatshirt",
    name: "Premium Sweatshirt",
    color,
    ids,
    sizes: CLOTHING_SIZES,
    pricePence: 5240,
    imagePath: `images/${image}`
  });
}

// Unisex Pigment-Dyed Hoodie
const pigmentColors = [
  ["Pigment Black", [13663, 13664, 13665, 13666, 13667], "winter-black.png"],
  ["Pigment Alpine Green", [13657, 13658, 13659, 13660, 13661], "winter-green.png"],
  ["Maroon", [13675, 13676, 13677, 13678, 13679], "winter-maroon.png"],
  ["Slate Blue", [13687, 13688, 13689, 13690, 13691], "winter-blue.png"],
  ["Pink", [13681, 13682, 13683, 13684, 13685], "winter-pink.png"],
  ["Light Blue", [13669, 13670, 13671, 13672, 13673], "winter-lightblue.png"]
];

for (const [color, ids, image] of pigmentColors) {
  addVariantGroup({
    productId: "pigment-hoodie",
    name: "Unisex Pigment-Dyed Hoodie",
    color,
    ids,
    sizes: HOODIE_SIZES,
    pricePence: 6825,
    imagePath: `images/${image}`
  });
}

// Organic Ribbed Beanie
const ribbedBeanieColors = [
  ["Black", 11706, "beanie-black.png"],
  ["Oxford Navy", 11708, "beanie-navy.png"],
  ["Burgundy", 17676, "beanie-burgundy.png"],
  ["Light Avio Blue", 17678, "beanie-blue.png"],
  ["Mustard Yellow", 11709, "beanie-yellow.png"],
  ["Light Grey", 17677, "beanie-grey.png"],
  ["Leaf Green", 11707, "beanie-green.png"]
];

for (const [color, id, image] of ribbedBeanieColors) {
  addVariantGroup({
    productId: "ribbed-beanie",
    name: "Organic Ribbed Beanie",
    color,
    ids: [id],
    sizes: ONE_SIZE,
    pricePence: 2763,
    imagePath: `images/${image}`
  });
}

// Pom-Pom Beanie
const pomBeanieColors = [
  ["Black", 4629, "pom-black.png"],
  ["Navy", 4634, "pom-navy.png"],
  ["Royal / Heather Grey", 8362, "pom-royalgrey.png"],
  ["Red", 4635, "pom-red.png"],
  ["Dark Heather Grey / Red", 4633, "pom-darkgreyred.png"],
  ["Dark Heather Grey / Navy", 4632, "pom-darkgreynavy.png"],
  ["Dark Heather Grey / Black", 4631, "pom-darkgreyblack.png"],
  ["Dark Heather Grey", 4630, "pom-darkgrey.png"],
  ["Neon Pink", 8360, "pom-neonpink.png"],
  ["Heather Grey", 11059, "pom-heathergrey.png"],
  ["Gold", 11058, "pom-gold.png"],
  ["Neon Green", 8359, "pom-neongreen.png"]
];

for (const [color, id, image] of pomBeanieColors) {
  addVariantGroup({
    productId: "pom-beanie",
    name: "Pom-Pom Beanie",
    color,
    ids: [id],
    sizes: ONE_SIZE,
    pricePence: 2463,
    imagePath: `images/${image}`
  });
}

// Eco Tote Bag
addVariantGroup({
  productId: "eco-tote",
  name: "Eco Tote Bag",
  color: "Black",
  ids: [10457],
  sizes: ONE_SIZE,
  pricePence: 2540,
  imagePath: "images/toteblack.png"
});

addVariantGroup({
  productId: "eco-tote",
  name: "Eco Tote Bag",
  color: "Oyster",
  ids: [10458],
  sizes: ONE_SIZE,
  pricePence: 2540,
  imagePath: "images/toteoyster.png"
});

// Sherpa Blanket
const blanketColors = [
  ["Black", 13444, "blanket-black.png"],
  ["Fireside Brown", 13445, "blanket-brown.png"],
  ["Heather Grey", 13446, "blanket-grey.png"]
];

for (const [color, id, image] of blanketColors) {
  addVariantGroup({
    productId: "sherpa-blanket",
    name: "Winter Edition Sherpa Blanket",
    color,
    ids: [id],
    sizes: ["50″×60″"],
    pricePence: 7463,
    imagePath: `images/${image}`
  });
}
// --------------------------------------------------
// PRINTFUL ARTWORK FILE IDS
// These are the artwork file IDs from your Printful
// store. The variant_id separately selects colour/size.
// --------------------------------------------------

const PRODUCT_FILE_IDS = {
  "10k-hoodie": {
    default: 1096981625,
    "Bone": 1096988508,
    "White": 1096988508
  },

  "premium-sweatshirt": {
    default: 1096990605,
    "Light Pink": 1096991809,
    "Bone": 1096991809,
    "Sky Blue": 1096991809,
    "White": 1096991809
  },

  "ribbed-beanie": 1097000044,
  "pom-beanie": 1097000044,

  "eco-tote": {
    "Black": 1096114545,
    "Oyster": 1096115705
  },

  "pigment-hoodie": 1097774453,
  "sherpa-blanket": 1097775987,

  "cap": 1078162734
};

function getPrintfulFileId(variant) {
  const productFiles = PRODUCT_FILE_IDS[variant.productId];

  if (typeof productFiles === "number") {
    return productFiles;
  }

  const fileId =
    productFiles?.[variant.color] ??
    productFiles?.default;

  return Number.isInteger(fileId) ? fileId : null;
}

function getPrintfulFileType(variant) {
  const productTypes = {
    "10k-hoodie": "embroidery_chest_left",
    "premium-sweatshirt": "embroidery_chest_left",
    "ribbed-beanie": "default",
    "pom-beanie": "default",
    "eco-tote": "embroidery_apparel_front",
    "pigment-hoodie": "embroidery_chest_left",
    "sherpa-blanket": "embroidery_corner_right",
    "cap": "embroidery_front_large"
  };

  return productTypes[variant.productId] || "default";
}

function getPrintfulOptions(variant) {
  const { productId, color } = variant;

// Preserve the existing cap embroidery setting.
if (productId === "cap") {
  return [
    { id: "thread_colors", value: ["#FFFFFF"] }
  ];
}

// Both beanies use the same two-colour logo.
if (productId === "ribbed-beanie" || productId === "pom-beanie") {
  return [
    {
      id: "thread_colors",
      value: ["#FFFFFF", "#000000"]
    }
  ];
}

// Tote bags use the apparel-front embroidery option.
if (productId === "eco-tote") {
    return [
      {
        id: "thread_colors_apparel",
        value: [color === "Black" ? "#FFFFFF" : "#000000"]
      }
    ];
  }

  // Sherpa blankets use corner-right embroidery.
  if (productId === "sherpa-blanket") {
    return [
      {
        id: "thread_colors_corner_right",
        value: ["#FFFFFF"]
      }
    ];
  }

  // Chest-left embroidery on hoodies and sweatshirts.
 if (productId === "pigment-hoodie") {
  return [{ id: "thread_colors_chest_left", value: ["#FFFFFF"] }];
}

if (productId === "10k-hoodie" || productId === "premium-sweatshirt") {
  const lightColors = ["Bone", "White", "Light Pink", "Sky Blue"];
  return [{ id: "thread_colors_chest_left", value: [lightColors.includes(color) ? "#000000" : "#FFFFFF"] }];
}

  throw new Error(
    `No Printful embroidery options configured for ${productId} / ${color}`
  );
}

// --------------------------------------------------
// CORS AND BASIC ROUTES
// --------------------------------------------------

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Stripe-Signature"]
}));

app.get("/", (_req, res) => {
  res.send("NICSTEPS API is running");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// --------------------------------------------------
// PRINTFUL DEBUG ROUTE
// Only available outside production.
// --------------------------------------------------

app.get("/debug-printful", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const headers = {
    Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
    "X-PF-Store-Id": process.env.PRINTFUL_STORE_ID
  };

  try {
    const response = await fetch(
      "https://api.printful.com/store/products?limit=100",
      { headers }
    );

    const data = await response.json();

    if (!response.ok || !Array.isArray(data.result)) {
      return res.status(502).json({
        error: "Printful product lookup failed",
        details: data
      });
    }

    const products = [];

    for (const product of data.result) {
      const detailResponse = await fetch(
        `https://api.printful.com/store/products/${product.id}`,
        { headers }
      );

      const detailData = await detailResponse.json();

      if (!detailResponse.ok || !detailData.result) {
        products.push({
          id: product.id,
          name: product.name,
          error: detailData
        });
        continue;
      }

      products.push({
        id: product.id,
        name: product.name,
        variants: (detailData.result.sync_variants || []).map(v => ({
          syncVariantId: v.id,
          printfulVariantId: v.variant_id,
          name: v.name,
          color: v.color,
          size: v.size,
          files: (v.files || []).map(f => ({
            id: f.id,
            type: f.type,
            filename: f.filename,
            status: f.status
          }))
        }))
      });
    }

    return res.json({
      storeId: process.env.PRINTFUL_STORE_ID,
      productCount: products.length,
      products
    });

  } catch (error) {
    console.error("Printful debug error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// --------------------------------------------------
// STRIPE WEBHOOK
// IMPORTANT: This must stay BEFORE express.json().
// --------------------------------------------------

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error(
        "Stripe webhook signature verification failed:",
        error.message
      );

      return res.status(400).send(
        `Webhook Error: ${error.message}`
      );
    }

    if (event.type !== "checkout.session.completed") {
      return res.json({ received: true });
    }

    const session = event.data.object;

    try {
      // Get Stripe line items and their product metadata.
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
        {
          limit: 100,
          expand: ["data.price.product"]
        }
      );

      const printfulItems = [];
      const emailItems = [];

      for (const line of lineItems.data) {
        const metadata = line.price?.product?.metadata || {};

        // Tips are not sent to Printful.
        if (metadata.isTip === "true") {
          continue;
        }

        const variantId = Number(metadata.printfulVariantId);
        const variant = VARIANTS[String(variantId)];
        if (variant?.productId === "cap") {
  throw new Error("Cap orders are disabled for this release.");
}

        if (!variant) {
          throw new Error(
            `Unknown Printful variant in paid Stripe session: ${variantId}`
          );
        }

        const fileId = getPrintfulFileId(variant);

        if (!fileId) {
          throw new Error(
            `No Printful artwork file mapping for ${variant.productId} / ${variant.color} (variant ${variantId}).`
          );
        }

        // IMPORTANT:
        // variant_id selects the exact Printful colour and size.
        // files.id selects the artwork.
        // No options, thread colours or file placement type are sent.
      const fileType = getPrintfulFileType(variant);
const printfulOptions = getPrintfulOptions(variant);

const printfulItem = {
  variant_id: variantId,
  quantity: line.quantity,

  files: [
    {
      id: fileId,
      type: fileType
    }
  ],

  options: printfulOptions
};


        printfulItems.push(printfulItem);

        emailItems.push({
          name: variant.name,
          description: `${variant.color} · ${variant.size}`,
          quantity: line.quantity,
          price: variant.pricePence / 100,
          image: `${FRONTEND_BASE_URL}/${variant.imagePath}`
        });
      }

      if (!printfulItems.length) {
        throw new Error(
          "Paid checkout contains no fulfilment items."
        );
      }

      // Build the delivery address from Stripe checkout.
      const shipping =
        session.shipping_details ||
        session.shipping ||
        null;

      const address =
        shipping?.address ||
        session.customer_details?.address ||
        {};

      const recipient = {
        name:
          shipping?.name ||
          session.customer_details?.name ||
          "NICSTEPS Customer",

        email:
          session.customer_details?.email ||
          session.customer_email,

        address1: address.line1,
        address2: address.line2 || undefined,
        city: address.city,
        state_code: address.state || undefined,
        zip: address.postal_code,
        country_code: address.country
      };

      if (
        !recipient.email ||
        !recipient.address1 ||
        !recipient.city ||
        !recipient.zip ||
        !recipient.country_code
      ) {
        throw new Error(
          "Stripe checkout completed without the required shipping details."
        );
      }

      // Create a repeatable external ID from the Stripe session.
      const printfulExternalId = createHash("sha256")
        .update(session.id)
        .digest("hex")
        .slice(0, 32);

      // Create the Printful order as an UNCONFIRMED draft
      // while testing. Change confirm to true only when
      // you are ready for real fulfilment.
      const printfulResponse = await fetch(
        "https://api.printful.com/orders",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
            "X-PF-Store-Id": process.env.PRINTFUL_STORE_ID,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            confirm: false,
            external_id: printfulExternalId,
            recipient,
            items: printfulItems
          })
        }
      );

      const printfulData = await printfulResponse.json();

      if (
        !printfulResponse.ok ||
        !printfulData?.result?.id
      ) {
        console.error(
          "Printful order creation failed:",
          printfulData
        );

        throw new Error(
          `Printful order creation failed: ${
            printfulData?.error?.message ||
            JSON.stringify(printfulData)
          }`
        );
      }

      console.log(
        "Printful draft order created successfully:",
        printfulData.result.id
      );

      // Prepare the customer confirmation email.
      const subtotal =
        (session.amount_subtotal || 0) / 100;

      const shippingCost =
        (session.total_details?.amount_shipping || 0) / 100;

      const order = {
        customerName: recipient.name,
        email: recipient.email,
        orderNumber: String(printfulData.result.id),
        orderDate: new Date().toLocaleDateString("en-GB"),
        items: emailItems,
        subtotal,
        shipping: shippingCost,
        total: (session.amount_total || 0) / 100,

        shippingAddress: [
          recipient.address1,
          recipient.address2,
          recipient.city,
          recipient.zip,
          recipient.country_code
        ]
          .filter(Boolean)
          .join(", ")
      };

      try {
  console.log("Attempting order confirmation email for:", order.email);

  await sendOrderConfirmation(order);

  console.log("Customer order confirmation email sent.");
} catch (emailError) {
  console.error(
    "Order email failed (Printful draft was created):",
    emailError
  );
}

      console.log(
        `Printful order ${printfulData.result.id} created for Stripe session ${session.id}`
      );

    } catch (error) {
      console.error("Webhook fulfilment failed:", error);

      // Stripe will retry when it receives a 500 response.
      return res.status(500).send(
        "Fulfilment failed; Stripe will retry this webhook."
      );
    }

    return res.json({ received: true });
  }
);
// --------------------------------------------------
// NORMAL JSON MIDDLEWARE
// Keep this AFTER the Stripe webhook route.
// --------------------------------------------------

app.use(express.json({ limit: "100kb" }));
app.use("/api/challenge", challengeRoutes);

// --------------------------------------------------
// STRIPE CHECKOUT SESSION
// The backend controls all prices and product details.
// The browser only supplies variantId and quantity.
// --------------------------------------------------

app.post("/create-checkout-session", async (req, res) => {
  try {
    const {
      items,
      customerEmail,
      tipAmount = 0
    } = req.body || {};

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 50
    ) {
      return res.status(400).json({
        error: "Your basket is empty or contains too many items."
      });
    }

    if (
      typeof customerEmail !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())
    ) {
      return res.status(400).json({
        error: "Please enter a valid email address."
      });
    }

    if (
      !Number.isInteger(tipAmount) ||
      tipAmount < 0 ||
      tipAmount > 50000
    ) {
      return res.status(400).json({
        error: "The optional tip amount is invalid."
      });
    }

    const line_items = [];

    for (const item of items) {
      const variantId = String(Number(item?.variantId));
      const variant = VARIANTS[variantId];
      const quantity = Number(item?.quantity);
      if (variant?.productId === "cap") {
  return res.status(400).json({
    error: "Caps are temporarily unavailable."
  });
}

      if (
        !variant ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      ) {
        return res.status(400).json({
          error:
            "One or more basket options are invalid. Please refresh your basket and try again."
        });
      }

      line_items.push({
        price_data: {
          currency: "gbp",
          tax_behavior: "exclusive",

          product_data: {
            name: `${variant.name} — ${variant.color} / ${variant.size}`,
            tax_code: "txcd_20030000",

            metadata: {
              printfulVariantId: variantId,
              productId: variant.productId
            }
          },

          unit_amount: variant.pricePence
        },

        quantity
      });
    }

    // Optional tip. This is not sent to Printful.
    if (tipAmount > 0) {
      line_items.push({
        price_data: {
          currency: "gbp",
          tax_behavior: "exclusive",

          product_data: {
            name: "Optional tip for NIC",
            tax_code: "txcd_99999999",

            metadata: {
              isTip: "true"
            }
          },

          unit_amount: tipAmount
        },

        quantity: 1
      });
    }

    const session = await stripe.checkout.sessions.create({
      allow_promotion_codes: true,
      payment_method_types: ["card"],
      mode: "payment",

      customer_email: customerEmail.trim(),

      shipping_address_collection: {
        allowed_countries: [
          "GB", "IE", "FR", "DE", "ES", "IT", "NL", "BE",
          "SE", "NO", "FI", "DK", "US", "CA", "AU", "NZ",
          "AT", "CH", "PT", "PL", "CZ", "SK", "HU", "RO",
          "BG", "EE", "LV", "LT", "JP", "KR", "SG", "HK",
          "MY", "TH", "PH", "ID", "BR", "AR", "CL", "MX",
          "ZA"
        ]
      },

      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",

            fixed_amount: {
              amount: 0,
              currency: "gbp"
            },

            display_name: "Free Shipping",

            delivery_estimate: {
              minimum: {
                unit: "business_day",
                value: 2
              },

              maximum: {
                unit: "business_day",
                value: 5
              }
            }
          }
        }
      ],

      billing_address_collection: "required",

      line_items,

      success_url:
        `${FRONTEND_BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url:
        `${FRONTEND_BASE_URL}/cancel.html`
    });

    return res.json({
      url: session.url
    });

  } catch (error) {
    console.error(
      "Stripe checkout session error:",
      error
    );

    return res.status(500).json({
      error: "Unable to start secure checkout. Please try again."
    });
  }
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

// DEBUG PRINTFUL EMBROIDERY OPTIONS
app.get("/debug-embroidery/:id", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  const productId = req.params.id;

  try {
    const response = await fetch(
      `https://api.printful.com/store/products/${productId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
          "X-PF-Store-Id": "18797480",
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    const variants = data.result?.sync_variants || [];

    const debug = variants.map((variant) => ({
      variant_id: variant.variant_id,
      name: variant.name,
      color: variant.color,
      size: variant.size,

      files: (variant.files || []).map((file) => ({
        id: file.id,
        type: file.type,
        options: file.options || [],
      })),

      options: variant.options || [],
    }));

    res.json({
      product_id: productId,
      product_name: data.result?.sync_product?.name,
      variants: debug,
    });

  } catch (error) {
    console.error("Embroidery debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(
    `NICSTEPS backend listening on port ${PORT}`
  );
});