// =========================================================
// New Horizon School — Email Notifications (via EmailJS)
// -----------------------------------------------------------
// Firebase alone can't send email from browser code — that needs a
// paid Cloud Functions setup. EmailJS is a free service that lets a
// static site send email directly from the browser, no backend
// required. This file wires it in.
//
// SETUP REQUIRED — fill in the three values below after creating a
// free account at https://www.emailjs.com (see README.md for the
// full step-by-step). Until you fill these in, in-app notifications
// (the bell icon) keep working fine — only the emailed copy is
// skipped.
// =========================================================

const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";   // EmailJS → Account → General
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";   // EmailJS → Email Services
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID"; // EmailJS → Email Templates

const configured = () =>
  EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY" &&
  EMAILJS_SERVICE_ID !== "YOUR_SERVICE_ID" &&
  EMAILJS_TEMPLATE_ID !== "YOUR_TEMPLATE_ID" &&
  typeof window.emailjs !== "undefined";

export function initEmailJS() {
  if (typeof window.emailjs !== "undefined" && EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY") {
    window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  }
}

// Fire-and-forget: a failed email should never block the app or show
// an error to the user — the in-app notification is the one that
// matters; email is a bonus alert.
export function sendEmailNotification(toEmail, toName, title, body) {
  if (!configured() || !toEmail) return;
  window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email: toEmail,
    to_name: toName || "there",
    subject: title,
    message: body,
    school_name: "New Horizon School",
  }).catch((err) => console.warn("Email notification failed (in-app notification still works):", err));
}