import sgMail from "@sendgrid/mail";

export async function sendOrderConfirmation(order) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("SENDGRID_API_KEY is not set; order confirmation email was skipped.");
    return;
  }
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const msg = {
    to: order.email,
    bcc: process.env.ORDER_BCC_EMAIL || "nickstepsinfo@gmail.com",
    from: process.env.ORDER_FROM_EMAIL || "orders@nicsteps.co.uk",
    reply_to: process.env.ORDER_REPLY_TO_EMAIL || "orders@nicsteps.co.uk",
    templateId: process.env.SENDGRID_TEMPLATE_ID || "d-79995007e9a34c7db845b1572a7380ae",
    dynamic_template_data: {
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      email: order.email,
      items: order.items,
      subtotal: order.subtotal,
      shipping: order.shipping,
      total: order.total,
      shippingAddress: order.shippingAddress
    }
  };

  try {
    await sgMail.send(msg);
    console.log("Order confirmation email sent.");
  } catch (error) {
    console.error(
      "SendGrid FULL ERROR:",
      JSON.stringify(error.response?.body, null, 2)
    );

    throw error;
  }
}