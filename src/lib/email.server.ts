/** Transactional email via Resend. */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#faf7f2;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <p style="font-size:18px;font-weight:600;color:#2b2118;margin:0 0 24px;">1Antiq <span style="color:#c2643a">Admin</span></p>
    <div style="background:#fff;border:1px solid #ece5da;border-radius:14px;padding:28px;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#2b2118;">${escapeHtml(title)}</h1>
      ${body}
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#8a7d6d;">This is a restricted administration console. If you didn't request this, secure the account immediately.</p>
  </div></body></html>`;
}

async function send(to: string, subject: string, html: string) {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["RESEND_FROM"] || "1Antiq Admin <onboarding@resend.dev>";
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not configured");
    throw new Error("Email delivery is not configured. Please set RESEND_API_KEY.");
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error("[email] resend failed", res.status, await res.text().catch(() => ""));
    throw new Error("We couldn't send that email right now. Please try again in a minute.");
  }
}

export async function sendAdminOtpEmail(
  to: string,
  code: string,
  minutes: number,
  context: string,
) {
  await send(
    to,
    "Your 1Antiq admin verification code",
    shell(
      context,
      `<p style="margin:0 0 16px;color:#5c5145;font-size:14px;">Use this one-time code to continue:</p>
       <p style="margin:0 0 16px;font-size:34px;letter-spacing:10px;font-weight:700;color:#2b2118;">${escapeHtml(code)}</p>
       <p style="margin:0;color:#8a7d6d;font-size:13px;">The code expires in ${minutes} minutes and can be used once.</p>`,
    ),
  );
}

export async function sendAdminAlertEmail(to: string, title: string, message: string) {
  await send(
    to,
    `1Antiq Admin — ${title}`,
    shell(title, `<p style="margin:0;color:#5c5145;font-size:14px;">${escapeHtml(message)}</p>`),
  );
}
