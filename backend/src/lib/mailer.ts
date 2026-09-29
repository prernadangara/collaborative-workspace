/**
 * Minimal mail abstraction. No SMTP provider is wired up (out of scope for
 * the assignment), so messages are logged. Swap the body of `sendMail` for
 * nodemailer / Resend / SES without touching callers or the worker.
 */
export async function sendMail(to: string, subject: string, body: string) {
  console.log(`[mail] to=${to} subject="${subject}"\n${body}`);
}
