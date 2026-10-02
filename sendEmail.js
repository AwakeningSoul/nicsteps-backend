import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendOrderConfirmation(order) {
  const msg = {
    to: order.email,
    bcc: "nickstepsinfo@gmail.com",   // Hidden copy to your Gmail
    from: "orders@nicsteps.co.uk",    // Authenticated domain sender
    reply_to: "orders@nicsteps.co.uk",
    templateId: "d-79995007e9a34c7db845b1572a7380ae",
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
    console.error("SendGrid error:", error);
  }
}


