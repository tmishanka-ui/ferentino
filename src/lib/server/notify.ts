import { env } from './env';
import { Ctx, ApiError, clip, json, needUser } from './http';
import { log } from './auth';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export async function sendEmail(to: string, subject: string, html: string) {
  if (!env.resendApiKey || !env.mailFrom) {
    throw new ApiError(503, 'E-mail is not configured on the server yet. Ask the administrator to set the RESEND_API_KEY and MAIL_FROM environment variables.');
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.mailFrom, to, subject, html }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new ApiError(502, 'The e-mail could not be sent: ' + (t || r.status));
  }
}

/** Internal Audit: tells someone by e-mail that they have been assigned as a Team Leader for an audit team. */
export async function notifyAuditLeader(c: Ctx) {
  const user = needUser(c);
  const b = await c.json();
  const to = clip(b.to, 200).toLowerCase();
  const name = clip(b.name, 120), dept = clip(b.dept, 120), auditTitle = clip(b.auditTitle, 200), date = clip(b.date, 60), time = clip(b.time, 60), venue = clip(b.venue, 120);
  if (!EMAIL.test(to)) throw new ApiError(400, 'Enter a valid e-mail address for the Team Leader.');
  if (!auditTitle) throw new ApiError(400, 'Missing audit title.');
  const when = [date, time].filter(Boolean).join(' · ');
  const html = `<p>Hello ${esc(name || 'there')},</p>
<p>You have been assigned as the <b>Team Leader</b> for the internal audit of the <b>${esc(dept || 'assigned')}</b> department / process, as part of:</p>
<p style="font-size:15px"><b>${esc(auditTitle)}</b></p>
${when ? `<p>Scheduled: <b>${esc(when)}</b>${venue ? ' · Venue: ' + esc(venue) : ''}</p>` : ''}
<p>Assigned by ${esc(user.name)}.</p>
<p style="color:#777;font-size:12px">This is an automated message from the Ferentino Internal Audit system.</p>`;
  await sendEmail(to, 'You have been assigned as Team Leader — ' + auditTitle, html);
  await log(c.s, user._id, 'audit-leader-notified', to + ' · ' + (dept || auditTitle), c.ip);
  return json(200, { ok: true });
}
