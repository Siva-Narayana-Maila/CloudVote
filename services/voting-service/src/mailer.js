const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

// Everything that goes into the HTML body is escaped, so a candidate or
// election name can never inject markup into a voter's inbox.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Header values (like the subject) must never contain line breaks, which
// would let someone smuggle in extra headers such as a hidden Bcc.
function oneLine(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

// Reads its settings from environment variables, so the same code works with
// Gmail today and Amazon SES (or any SMTP service) later — only the values
// change. If SMTP isn't configured, email is simply switched off.
function createMailer(env = process.env) {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return {
      enabled: false,
      sendVoteReceipt: async () => ({ sent: false, reason: 'email not configured' }),
    };
  }

  const port = Number(env.SMTP_PORT) || 587;
  const baseUrl = (env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const from = env.MAIL_FROM || SMTP_USER;
  const includeChoice = String(env.EMAIL_INCLUDE_CHOICE ?? 'true').toLowerCase() !== 'false';
  const requireTLS = port !== 465 && String(env.SMTP_REQUIRE_TLS ?? 'true').toLowerCase() !== 'false';

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    // Never send the mail password over an unencrypted connection.
    requireTLS,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  // Sends the receipt. Never throws: a failed email must not affect a vote
  // that has already been recorded.
  async function sendVoteReceipt({ to, name, electionName, candidateName, candidateSymbol, receipt }) {
    try {
      const verifyUrl = baseUrl
        ? `${baseUrl}/verify?receipt=${encodeURIComponent(receipt.receiptId)}`
        : null;

      const qrPng = await QRCode.toBuffer(verifyUrl || receipt.receiptId, {
        type: 'png',
        width: 240,
        margin: 1,
        color: { dark: '#0b1f3a', light: '#ffffff' },
      });

      const recordedAt = new Date(receipt.castAt).toUTCString();
      const choiceLabel = candidateSymbol ? `${candidateSymbol} ${candidateName}` : candidateName;
      const greeting = oneLine(name) || 'there';

      const text = [
        `Hi ${greeting},`,
        '',
        `Your vote in "${oneLine(electionName)}" has been recorded.`,
        '',
        includeChoice
          ? `You voted for: ${oneLine(choiceLabel)}`
          : 'For your privacy, your choice is not included in this email.',
        '',
        `Receipt ID:       ${receipt.receiptId}`,
        `Ledger position:  #${receipt.ledgerPosition}`,
        `Recorded at:      ${recordedAt}`,
        `Commitment hash:  sha256:${receipt.commitmentHash}`,
        '',
        verifyUrl ? `Verify your receipt any time: ${verifyUrl}` : 'Keep this receipt to verify your vote later.',
        '',
        includeChoice
          ? 'Keep this email private: anyone who can read it can see how you voted.'
          : 'Keep this email private: it contains your receipt.',
      ].join('\n');

      const choiceBlock = includeChoice
        ? `<tr><td style="padding:14px 0;border-bottom:1px solid #e6e1d3;">
             <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#7a8190;">You voted for</div>
             <div style="font-size:18px;font-weight:600;color:#0b1f3a;margin-top:4px;">${escapeHtml(choiceLabel)}</div>
           </td></tr>`
        : `<tr><td style="padding:14px 0;border-bottom:1px solid #e6e1d3;font-size:13px;color:#5c6478;">
             For your privacy, your choice is not included in this email.
           </td></tr>`;

      const field = (label, value) => `
        <tr><td style="padding:10px 0;border-bottom:1px solid #e6e1d3;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#7a8190;">${label}</div>
          <div style="font-family:Consolas,Menlo,monospace;font-size:13px;color:#10192b;margin-top:3px;word-break:break-all;">${escapeHtml(value)}</div>
        </td></tr>`;

      const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f1e6;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf5;border-radius:14px;overflow:hidden;border:1px solid #ddd8c8;">
    <tr><td style="background:#0b1f3a;padding:22px 28px;">
      <span style="font-family:Georgia,serif;font-size:20px;font-weight:600;color:#faf3e8;">Ballot<span style="color:#c9a227;">ique</span></span>
    </td></tr>
    <tr><td style="padding:28px;">
      <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:22px;color:#0b1f3a;">Your vote is in the ledger.</h1>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#5c6478;">
        Hi ${escapeHtml(greeting)}, your vote in <strong>${escapeHtml(electionName)}</strong> has been recorded.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${choiceBlock}
        ${field('Receipt ID', receipt.receiptId)}
        ${field('Ledger position', `#${receipt.ledgerPosition}`)}
        ${field('Recorded at', recordedAt)}
        ${field('Commitment hash', `sha256:${receipt.commitmentHash}`)}
      </table>
      <div style="text-align:center;margin-top:26px;">
        <img src="cid:receipt-qr" width="180" height="180" alt="QR code to verify your receipt"
             style="border:1px solid #ddd8c8;border-radius:8px;background:#ffffff;" />
        <div style="font-size:12px;color:#7a8190;margin-top:8px;">Scan to verify your receipt</div>
        ${verifyUrl ? `<a href="${escapeHtml(verifyUrl)}" style="display:inline-block;margin-top:14px;padding:11px 22px;background:#16335c;color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;">Verify my receipt</a>` : ''}
      </div>
      <p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:#7a8190;">
        ${includeChoice
          ? 'Keep this email private: anyone who can read it can see how you voted.'
          : 'Keep this email private: it contains your receipt.'}
      </p>
    </td></tr>
  </table>
</body></html>`;

      const info = await transporter.sendMail({
        from,
        to,
        subject: oneLine(`Your vote receipt — ${electionName}`),
        text,
        html,
        attachments: [
          {
            filename: 'receipt-qr.png',
            content: qrPng,
            contentType: 'image/png',
            contentDisposition: 'inline',
            cid: 'receipt-qr',
          },
        ],
      });

      return { sent: true, messageId: info.messageId };
    } catch (err) {
      console.error('[mailer] could not send receipt email:', err.message);
      return { sent: false, error: err.message };
    }
  }

  return { enabled: true, includeChoice, sendVoteReceipt };
}

module.exports = { createMailer, escapeHtml, oneLine };