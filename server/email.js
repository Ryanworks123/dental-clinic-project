import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { config } from './config.js';
import { supabase } from './supabase.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;
const gmailTransport = config.emailProvider === 'gmail' && config.gmailUser && config.gmailAppPassword
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: config.gmailUser, pass: config.gmailAppPassword } })
  : null;
const senderAddress = () => {
  if (config.emailProvider === 'gmail') return String(config.gmailUser || '');
  const sender = String(config.emailFrom || '');
  return sender.match(/<([^>]+)>/)?.[1] || sender;
};
const isTestingSender = () => senderAddress().toLowerCase().endsWith('@resend.dev');
const isHostedSender = () => senderAddress().toLowerCase().endsWith('@vercel.app');

function safeError(error) {
  const message = String(error?.message || 'Email delivery failed.');
  if (/application-specific password|username and password not accepted|invalid login|authentication failed/i.test(message)) return 'Gmail authentication failed. Create a new Google App Password and update GMAIL_APP_PASSWORD.';
  if (/only send testing emails|resend\.dev|verify a domain/i.test(message)) return 'Resend is using its testing sender. Verify a clinic domain in Resend, then use an address from that domain for EMAIL_FROM.';
  if (/api key|token|authorization/i.test(message)) return 'Email provider authentication failed.';
  if (/domain|sender|from/i.test(message)) return 'The clinic sender address is not verified.';
  if (/recipient|email|to/i.test(message)) return 'The recipient email address is invalid.';
  return 'Email delivery is temporarily unavailable.';
}

async function logEvent({ appointmentId = null, messageId = null, recipient, subject, status, errorMessage = null, resendMessageId = null }) {
  try {
    await supabase.from('email_events').insert({ appointment_id: appointmentId, message_id: messageId, recipient, subject, provider: config.emailProvider, status, error_message_safe: errorMessage, resend_message_id: resendMessageId });
  } catch (error) {
    if (!['42P01', 'PGRST205'].includes(error?.code)) console.error('Unable to record email event:', error.message);
  }
}

export function getEmailStatus() {
  if (config.emailProvider === 'gmail') {
    const automaticEmail = gmailTransport ? 'connected' : 'not_configured';
    return {
      provider: 'gmail', automaticEmail, senderDomain: senderAddress().split('@')[1] || null,
      message: automaticEmail === 'connected' ? 'Gmail delivery is configured. Use Send test email to verify the account can send.' : 'Set GMAIL_USER and GMAIL_APP_PASSWORD on the server to enable Gmail delivery.',
      gmailDraftFallback: 'available', checkedAt: new Date().toISOString()
    };
  }
  const automaticEmail = !resend || !config.emailFrom ? 'not_configured' : isTestingSender() ? 'testing_only' : isHostedSender() ? 'domain_required' : 'connected';
  return {
    provider: 'resend',
    automaticEmail,
    senderDomain: senderAddress().split('@')[1] || null,
    message: automaticEmail === 'testing_only'
      ? 'Resend testing mode only delivers to the Resend account owner. Verify a clinic domain to email customers.'
      : automaticEmail === 'domain_required'
        ? 'A Vercel hosting address cannot be used as an email sender. Add and verify a domain you own in Resend, then use an address on that domain for EMAIL_FROM.'
      : automaticEmail === 'not_configured'
        ? 'Add RESEND_API_KEY and EMAIL_FROM to enable automatic email.'
        : 'Automatic customer email is ready.',
    gmailDraftFallback: 'available',
    checkedAt: new Date().toISOString()
  };
}

export async function sendEmail({ to, subject, text, html, replyTo, appointmentId, messageId }) {
  const recipient = String(to || '').trim().toLowerCase();
  if (!emailPattern.test(recipient)) {
    const result = { sent: false, provider: config.emailProvider, error: 'The recipient email address is invalid.' };
    await logEvent({ appointmentId, messageId, recipient: recipient || null, subject, status: 'failed', errorMessage: result.error });
    return result;
  }
  const providerReady = config.emailProvider === 'gmail' ? Boolean(gmailTransport) : Boolean(resend && config.emailFrom);
  if (!providerReady) {
    const result = { sent: false, provider: config.emailProvider, error: 'Automatic email is not configured.' };
    await logEvent({ appointmentId, messageId, recipient, subject, status: 'failed', errorMessage: result.error });
    return result;
  }
  try {
    if (config.emailProvider === 'gmail') {
      const data = await gmailTransport.sendMail({ from: config.gmailUser, to: recipient, subject, text, html: html || undefined, replyTo: replyTo || undefined });
      await logEvent({ appointmentId, messageId, recipient, subject, status: 'sent', resendMessageId: data?.messageId || null });
      return { sent: true, provider: 'gmail', messageId: data?.messageId || null, sentAt: new Date().toISOString() };
    }
    const { data, error } = await resend.emails.send({ from: config.emailFrom, to: recipient, subject, text, html: html || undefined, replyTo: replyTo || undefined });
    if (error) throw new Error(error.message || 'Resend rejected the email.');
    await logEvent({ appointmentId, messageId, recipient, subject, status: 'sent', resendMessageId: data?.id || null });
    return { sent: true, provider: 'resend', messageId: data?.id || null, sentAt: new Date().toISOString() };
  } catch (error) {
    const result = { sent: false, provider: config.emailProvider, error: safeError(error) };
    await logEvent({ appointmentId, messageId, recipient, subject, status: 'failed', errorMessage: result.error });
    console.error(`${config.emailProvider} delivery failed:`, result.error);
    return result;
  }
}

const appointmentText = (appointment, intro) => `${intro}\n\nPatient: ${appointment.patient_name}\nDate and time: ${new Date(appointment.starts_at).toLocaleString()}\n${appointment.services?.name ? `Service: ${appointment.services.name}\n` : ''}${appointment.dentist?.display_name ? `Dentist: ${appointment.dentist.display_name}\n` : ''}\nBright Smile Dental`;
export const sendAppointmentConfirmation = (appointment) => sendEmail({ to: appointment.patient_email, appointmentId: appointment.id, subject: 'Bright Smile Dental appointment request received', text: appointmentText(appointment, 'We received your appointment request. Our team will confirm it shortly.') });
export const sendAppointmentApproved = (appointment) => sendEmail({ to: appointment.patient_email, appointmentId: appointment.id, subject: 'Your Bright Smile Dental appointment is confirmed', text: appointmentText(appointment, 'Your appointment has been confirmed.') });
export const sendAppointmentRejected = (appointment) => sendEmail({ to: appointment.patient_email, appointmentId: appointment.id, subject: 'Bright Smile Dental appointment update', text: appointmentText(appointment, 'Your appointment request could not be approved. Please contact the clinic to choose another time.') });
export const sendAppointmentCancelled = (appointment) => sendEmail({ to: appointment.patient_email, appointmentId: appointment.id, subject: 'Your Bright Smile Dental appointment was cancelled', text: appointmentText(appointment, 'Your appointment was cancelled. Contact the clinic if you would like to arrange another visit.') });
export const sendAdminMessage = (message) => sendEmail({ to: config.adminEmail, replyTo: message.email, messageId: message.id, subject: `Clinic message: ${message.subject}`, text: `New customer message from ${message.name}.\nEmail: ${message.email}\nPhone: ${message.phone || 'Not provided'}\n\n${message.message}` });
export const sendBookingNotification = (appointment) => sendEmail({ to: config.adminEmail, replyTo: appointment.patient_email, appointmentId: appointment.id, subject: `New booking request: ${appointment.patient_name}`, text: appointmentText(appointment, 'A new appointment request was submitted.') });
export const sendContactNotification = sendAdminMessage;
export const sendPatientReply = (message) => sendEmail({ to: message.email, replyTo: config.adminEmail, messageId: message.id, subject: `Bright Smile Dental: ${message.subject}`, text: `Hello ${message.name || 'there'},\n\nOur clinic team replied to your message:\n\n${message.message}\n\nBright Smile Dental` });
export const sendTestEmail = () => sendEmail({ to: config.adminEmail, subject: 'Bright Smile Dental email test', text: `This is a test email from the clinic system.\n\nSent: ${new Date().toLocaleString()}` });
