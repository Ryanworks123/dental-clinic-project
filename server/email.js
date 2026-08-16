import nodemailer from 'nodemailer';
import { config } from './config.js';

const transporter = config.gmailUser && config.gmailAppPassword
  ? nodemailer.createTransport({ service: 'gmail', auth: { user: config.gmailUser, pass: config.gmailAppPassword } })
  : null;

async function send(subject, details) {
  if (!transporter || !config.bookingNotificationEmail) return false;
  await transporter.sendMail({
    from: `Bright Smile Dental <${config.gmailUser}>`,
    to: config.bookingNotificationEmail,
    replyTo: details.replyTo,
    subject,
    text: details.body
  });
  return true;
}

export function sendBookingNotification(appointment) {
  return send(`New booking request: ${appointment.patient_name}`, {
    replyTo: appointment.patient_email || undefined,
    body: `A new appointment request was submitted.\n\nPatient: ${appointment.patient_name}\nPhone: ${appointment.patient_phone}\nEmail: ${appointment.patient_email || 'Not provided'}\nDate and time: ${new Date(appointment.starts_at).toLocaleString()}\nService ID: ${appointment.service_id}\nDentist ID: ${appointment.dentist_id}\nNotes: ${appointment.notes || 'None'}\n\nOpen the admin dashboard to confirm or update this appointment.`
  });
}

export function sendContactNotification(message) {
  return send(`Website inquiry: ${message.subject}`, {
    replyTo: message.email,
    body: `A new website inquiry was submitted.\n\nFrom: ${message.name}\nEmail: ${message.email}\nPhone: ${message.phone || 'Not provided'}\nSubject: ${message.subject}\n\nMessage:\n${message.message}`
  });
}
