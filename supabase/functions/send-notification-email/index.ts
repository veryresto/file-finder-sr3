import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// ===========================================
// EMAIL NOTIFICATION CONFIGURATION
// ===========================================
// Change these values to customize email notifications

const CONFIG = {
  // Enable/disable email notifications
  ENABLE_NEW_USER_NOTIFICATION: true,  // Notify admin when new user registers
  ENABLE_APPROVAL_NOTIFICATION: true,   // Notify user when approved by admin
  ENABLE_REJECTION_NOTIFICATION: true,  // Notify user when rejected by admin

  // Admin email to receive new user notifications
  ADMIN_EMAIL: "veryresto@gmail.com",

  // Email sender configuration
  // Note: For production, use a verified domain in Resend
  // For testing, you can use "onboarding@resend.dev" 
  FROM_EMAIL: "IPL Finder <onboarding@resend.dev>",

  // Email subjects
  NEW_USER_SUBJECT: "New User Registration - Pending Approval",
  APPROVAL_SUBJECT: "Your Account Has Been Approved!",
  REJECTION_SUBJECT: "Update on Your Account Status",

  // App name for email content
  APP_NAME: "Warga RT02",
};

// ===========================================
// END CONFIGURATION
// ===========================================

const sendEmail = async (to: string[], subject: string, html: string) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: CONFIG.FROM_EMAIL,
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }

  return response.json();
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  type: "new_user" | "user_approved" | "user_rejected";
  userEmail: string;
  userName?: string;
  houseNumber?: string;
  permissions?: string[];
}

const generateNewUserEmailHtml = (userName: string, userEmail: string, houseNumber?: string): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">🔔 New User Registration</h1>
        </div>
        <div class="content">
          <p>A new user has registered and is waiting for your approval:</p>
          <div class="info-box">
            <p><strong>Name:</strong> ${userName || "Not provided"}</p>
            <p><strong>Email:</strong> ${userEmail}</p>
            ${houseNumber ? `<p><strong>House Number:</strong> ${houseNumber}</p>` : ""}
          </div>
          <p>Please log in to the admin panel to review and approve this user.</p>
          <div class="footer">
            <p>This email was sent from ${CONFIG.APP_NAME}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

const generateApprovalEmailHtml = (userName: string, permissions: string[]): string => {
  const permissionText = permissions.map(p => {
    if (p === "read_files") return "📖 Read files";
    if (p === "upload_files") return "📤 Upload files";
    return p;
  }).join("<br>");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .permissions-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        .cta { display: inline-block; background: #10b981; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">🎉 You're Approved!</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || "there"},</p>
          <p>Great news! Your account has been approved by an administrator. You now have access to the following features:</p>
          <div class="permissions-box">
            ${permissionText}
          </div>
          <p>You can now log in and start using the app.</p>
          <div class="footer">
            <p>Welcome to ${CONFIG.APP_NAME}!</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

const generateRejectionEmailHtml = (userName: string): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Account Status Update</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || "there"},</p>
          <div class="info-box">
            <p>We are writing to inform you that your request for access to <strong>${CONFIG.APP_NAME}</strong> has been declined by an administrator.</p>
          </div>
          <p>If you believe this is a mistake or have any questions, please contact the administrators for further details.</p>
          <div class="footer">
            <p>Thank you for your interest in ${CONFIG.APP_NAME}.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, userEmail, userName, houseNumber, permissions }: EmailRequest = await req.json();

    console.log(`Processing ${type} email notification for ${userEmail}`);

    if (type === "new_user") {
      if (!CONFIG.ENABLE_NEW_USER_NOTIFICATION) {
        console.log("New user notifications are disabled");
        return new Response(JSON.stringify({ success: true, message: "Notifications disabled" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const emailResponse = await sendEmail(
        [CONFIG.ADMIN_EMAIL],
        CONFIG.NEW_USER_SUBJECT,
        generateNewUserEmailHtml(userName || "", userEmail, houseNumber)
      );

      console.log("Admin notification sent:", emailResponse);

      return new Response(JSON.stringify({ success: true, data: emailResponse }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "user_approved") {
      if (!CONFIG.ENABLE_APPROVAL_NOTIFICATION) {
        console.log("Approval notifications are disabled");
        return new Response(JSON.stringify({ success: true, message: "Notifications disabled" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const emailResponse = await sendEmail(
        [userEmail],
        CONFIG.APPROVAL_SUBJECT,
        generateApprovalEmailHtml(userName || "", permissions || [])
      );

      console.log("User approval notification sent:", emailResponse);

      return new Response(JSON.stringify({ success: true, data: emailResponse }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "user_rejected") {
      if (!CONFIG.ENABLE_REJECTION_NOTIFICATION) {
        console.log("Rejection notifications are disabled");
        return new Response(JSON.stringify({ success: true, message: "Notifications disabled" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const emailResponse = await sendEmail(
        [userEmail],
        CONFIG.REJECTION_SUBJECT,
        generateRejectionEmailHtml(userName || "")
      );

      console.log("User rejection notification sent:", emailResponse);

      return new Response(JSON.stringify({ success: true, data: emailResponse }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid notification type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in send-notification-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
