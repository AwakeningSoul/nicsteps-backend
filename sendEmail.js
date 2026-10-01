import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendOrderConfirmation(order) {
  const msg = {
    to: order.email,
    from: "orders@nicsteps.co.uk",
    reply_to: "stiklene13@gmail.com",
    templateId: "d-62afb7207ded47f1a5e2714467493e9e",
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

