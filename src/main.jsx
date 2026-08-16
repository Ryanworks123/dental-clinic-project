import React, { StrictMode, Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './lib/api';
import { supabase } from './lib/supabase';
import portalCareIllustration from './assets/portal-care-illustration-cropped.png';
import './styles.css';

const HeroThreeBackground = lazy(() => import('./components/HeroThreeBackground'));

const services = [
  { name: 'Dental Cleaning', price: '₱1,200', duration: '45 min', icon: '✦', text: 'A gentle, thorough clean that leaves your smile refreshed.' },
  { name: 'Teeth Whitening', price: '₱4,500', duration: '60 min', icon: '☼', text: 'Professional whitening designed for natural-looking brightness.' },
  { name: 'Dental Fillings', price: '₱1,800', duration: '45 min', icon: '◒', text: 'Comfortable treatment with tooth-colored restorative materials.' },
  { name: 'Orthodontics', price: 'Consult', duration: '60 min', icon: '⌁', text: 'A thoughtful path toward a healthier, more confident smile.' }
];

const appointmentStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'];
const formatStatus = (status) => status.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function LoadingState({ label = 'Loading', compact = false }) {
  return <div className={`loading-state${compact ? ' loading-state-compact' : ''}`} role="status" aria-live="polite"><span className="loading-orbit" aria-hidden="true"><i/><i/><i/></span><span>{label}</span></div>;
}

function Header({ session, profile, onSignOut, signingOut }) {
  const [open, setOpen] = useState(false);
  return <header className="site-header"><Link className="brand brand-logo" to="/"><img src="/bright-smile-mark.svg" alt=""/>bright<span>smile</span></Link><button className="menu-button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="site-navigation" onClick={() => setOpen(!open)}>{open ? '×' : '☰'}</button><nav id="site-navigation" className={open ? 'open' : ''} onClick={() => setOpen(false)}>
    <NavLink to="/services">Services</NavLink><NavLink to="/about">Our clinic</NavLink><NavLink to="/contact">Contact</NavLink>
    {session ? <><NavLink to="/portal">My visits</NavLink>{profile?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}<button className={`text-button signout-button${signingOut ? ' is-signing-out' : ''}`} onClick={onSignOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button></> : <NavLink to="/login">Log in</NavLink>}
    <Link className="button button-small" to="/book">Book a visit</Link>
  </nav></header>;
}

function Home() { return <>
  <section className="hero"><Suspense fallback={null}><HeroThreeBackground/></Suspense><div className="eyebrow">Dental care, made personal</div><h1>Feel at home<br/><em>in your smile.</em></h1><p>Gentle dentistry for every age, with a team who takes the time to listen.</p><div className="hero-actions"><Link className="button" to="/book">Book an appointment <span>→</span></Link><Link className="button button-quiet" to="/services">Explore services</Link></div><div className="hero-note"><b>Mon–Sat</b> · 9:00 AM–6:00 PM <i/> New patient visits welcome</div><div className="hero-art" aria-hidden="true"><div className="orb orb-one"/><div className="orb orb-two"/><div className="smile">⌣</div></div></section>
  <section className="intro section"><div><div className="eyebrow">Care that fits your life</div><h2>Everything your smile needs, under one calm roof.</h2></div><p>From routine cleanings to restorative care, our clinic combines clear guidance, modern treatment, and a genuinely kind approach.</p></section>
  <section className="services-preview section"><div className="section-heading"><div><div className="eyebrow">Our care</div><h2>Little details. Big confidence.</h2></div><Link to="/services">View all services →</Link></div><div className="service-grid">{services.map((service) => <article className="service-card" key={service.name}><span className="service-icon">{service.icon}</span><h3>{service.name}</h3><p>{service.text}</p><div><b>{service.price}</b><span>{service.duration}</span></div></article>)}</div></section>
  <section className="team section"><div className="team-portrait"><div>Dr.<br/>Mia<br/>Santos</div></div><div><div className="eyebrow">Meet your care team</div><h2>Warm people. Expert hands.</h2><p>Our dentists pair years of experience with patient-first care, so you always know what to expect and never feel rushed.</p><Link className="button button-quiet" to="/about">Meet the clinic</Link><blockquote>“They made a dental visit feel surprisingly easy.” <cite>— Ana R., patient</cite></blockquote></div></section>
  <section className="cta section"><div><div className="eyebrow">Your next step</div><h2>Let’s make room for your smile.</h2></div><Link className="button" to="/book">Find an appointment <span>→</span></Link></section>
</> }

function Services() { return <main className="page section"><div className="eyebrow">Thoughtful treatment</div><h1>Care for every kind of smile.</h1><p className="lede">Your treatment is always explained in plain language, with options that respect your comfort and your goals.</p><div className="service-grid all-services">{services.concat([{ name: 'Root Canal Treatment', price: '₱6,500', duration: '90 min', icon: '◉', text: 'Relief-focused treatment to protect and save your natural tooth.' }, { name: 'Pediatric Dentistry', price: '₱1,000', duration: '30 min', icon: '♡', text: 'Happy, gentle first visits for our smallest patients.' }]).map((s) => <article className="service-card" key={s.name}><span className="service-icon">{s.icon}</span><h3>{s.name}</h3><p>{s.text}</p><div><b>{s.price}</b><span>{s.duration}</span></div></article>)}</div></main> }

function About() { return <main className="page section about"><div className="eyebrow">About bright smile</div><h1>Good dentistry starts with a good conversation.</h1><p className="lede">We built Bright Smile around a simple idea: dental care should feel clear, considerate, and entirely human.</p><div className="values"><article><b>01</b><h3>Listen first</h3><p>Your questions and comfort guide every recommendation.</p></article><article><b>02</b><h3>Explain clearly</h3><p>You’ll always understand your options before treatment begins.</p></article><article><b>03</b><h3>Care gently</h3><p>Thoughtful tools, skilled hands, and no unnecessary rushing.</p></article></div></main> }

function Contact() { const [state, setState] = useState({ loading: false, message: '', error: false }); const submit = async (event) => { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); setState({ loading: true, message: '', error: false }); try { await api('/messages', { method: 'POST', body: JSON.stringify(values) }); form.reset(); setState({ loading: false, message: 'Thanks for reaching out. Our clinic team will reply shortly.', error: false }); } catch (error) { setState({ loading: false, message: error.message, error: true }); } }; return <main className="page section contact"><div><div className="eyebrow">Visit us</div><h1>We’d love to see you.</h1><p className="lede">Questions, care needs, or a first visit—we’re here to help.</p><div className="contact-lines"><p><b>Call</b><br/>(02) 8123 4567</p><p><b>Visit</b><br/>123 Wellness Avenue, Manila</p><p><b>Hours</b><br/>Monday–Saturday, 9 AM–6 PM</p></div></div><form className="card-form" onSubmit={submit}><label>Name<input required name="name" placeholder="Your name" /></label><label>Email<input required name="email" type="email" placeholder="you@email.com" /></label><label>Phone <small>(optional)</small><input name="phone" placeholder="09XX XXX XXXX" /></label><label>Subject<input required name="subject" placeholder="How can we help?" /></label><label>Message<textarea required name="message" placeholder="Tell us how we can help" rows="5" /></label>{state.message && <p className={state.error ? 'form-error' : 'success'} role="status">{state.message}</p>}<button disabled={state.loading} className={`button${state.loading ? ' is-loading' : ''}`}>{state.loading ? 'Sending…' : 'Send message →'}</button></form></main> }

function Book({ session }) {
  const [form, setForm] = useState({ service: '', dentist: '', date: '', time: '', name: '', phone: '', email: '' }); const [state, setState] = useState({ loading: false, message: '' }); const [catalog, setCatalog] = useState({ services: [], dentists: [] });
  useEffect(() => { Promise.all([api('/services'), api('/dentists')]).then(([availableServices, availableDentists]) => setCatalog({ services: availableServices, dentists: availableDentists })).catch((error) => setState({ loading: false, message: error.message })); }, []);
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  async function submit(event) { event.preventDefault(); setState({ loading: true, message: '' });
    const chosen = catalog.services.find((service) => service.id === form.service); const begins = new Date(`${form.date}T${form.time}:00`); const end = new Date(begins.getTime() + (chosen?.duration_minutes || 30) * 60000);
    try { if (!session) throw new Error('Please log in or create an account before booking.'); if (Number.isNaN(begins.getTime()) || begins.getTime() <= Date.now()) throw new Error('Please choose a future appointment time.'); await api('/appointments', { token: session.access_token, method: 'POST', body: JSON.stringify({ serviceId: form.service, dentistId: form.dentist, startsAt: begins.toISOString(), endsAt: end.toISOString(), patientName: form.name, patientPhone: form.phone, patientEmail: form.email }) }); setState({ loading: false, message: 'Your appointment request is in! We’ll confirm it shortly.' }); }
    catch (error) { setState({ loading: false, message: error.message }); }
  }
  return <main className="page section booking"><div><div className="eyebrow">Book your visit</div><h1>A better visit begins here.</h1><p className="lede">Choose a service, a preferred time, and we’ll take care of the rest.</p><div className="booking-aside"><b>Need help choosing?</b><p>Call (02) 8123 4567 and our friendly team will help you find the right appointment.</p></div></div><form className="card-form booking-form" onSubmit={submit}><div className="form-row"><label>Service<select required name="service" value={form.service} onChange={update}><option value="">Choose a service</option>{catalog.services.map((s) => <option value={s.id} key={s.id}>{s.name} · ₱{s.price}</option>)}</select></label><label>Dentist<select required name="dentist" value={form.dentist} onChange={update}><option value="">Choose a dentist</option>{catalog.dentists.map((dentist) => <option value={dentist.id} key={dentist.id}>{dentist.display_name}</option>)}</select></label></div><div className="form-row"><label>Date<input required type="date" name="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={update}/></label><label>Preferred time<select required name="time" value={form.time} onChange={update}><option value="">Choose a time</option><option>09:00</option><option>10:00</option><option>11:00</option><option>14:00</option><option>15:00</option><option>16:00</option></select></label></div><div className="form-row"><label>Full name<input required name="name" value={form.name} onChange={update} placeholder="Your full name" /></label><label>Phone<input required name="phone" value={form.phone} onChange={update} placeholder="09XX XXX XXXX" /></label></div><label>Email<input required name="email" type="email" value={form.email} onChange={update} placeholder="you@email.com" /></label>{state.message && <p className={state.message.includes('in!') ? 'success' : 'form-error'} role="status">{state.message}</p>}<button disabled={state.loading || !catalog.services.length || !catalog.dentists.length} className={`button${state.loading ? ' is-loading' : ''}`}>{state.loading ? 'Sending request…' : 'Request appointment →'}</button></form></main>;
}

function Login({ onSession }) {
  const [mode, setMode] = useState('login'); const [notice, setNotice] = useState(''); const [noticeIsError, setNoticeIsError] = useState(false); const [submitting, setSubmitting] = useState(false); const [emailForVerification, setEmailForVerification] = useState(''); const navigate = useNavigate();
  const emailRedirectTo = import.meta.env.VITE_AUTH_REDIRECT_URL || `${window.location.origin}/login`;
  useEffect(() => { const code = new URLSearchParams(window.location.search).get('code'); const hashError = new URLSearchParams(window.location.hash.slice(1)).get('error_code'); if (hashError) { window.history.replaceState({}, '', '/login'); setNoticeIsError(true); setNotice('This verification link is invalid or expired. Request a new one below.'); return; } if (!code || !supabase) return; setSubmitting(true); supabase.auth.exchangeCodeForSession(code).then(async ({ error }) => { await supabase.auth.signOut(); window.history.replaceState({}, '', '/login'); setMode('login'); setSubmitting(false); setNoticeIsError(Boolean(error)); setNotice(error ? 'This verification link is invalid or expired. Request a new one below.' : 'Email verified. You can now log in.'); }); }, []);
  const resend = async () => { if (!emailForVerification || !supabase) return; setSubmitting(true); const { error } = await supabase.auth.resend({ type: 'signup', email: emailForVerification, options: { emailRedirectTo } }); setSubmitting(false); setNoticeIsError(Boolean(error)); setNotice(error ? 'We could not send a verification email yet. Please try again shortly.' : 'A new verification email has been sent. Check your inbox and spam folder.'); };
  const submit = async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); if (!supabase) { setNoticeIsError(true); return setNotice('The login service is unavailable. Please try again later.'); } const values = Object.fromEntries(form); const email = String(values.email || '').trim().toLowerCase(); if (mode === 'register' && values.password !== values.confirmPassword) { setNoticeIsError(true); return setNotice('Passwords do not match.'); } setSubmitting(true); setNotice(''); const { data, error } = mode === 'login' ? await supabase.auth.signInWithPassword({ email, password: values.password }) : await supabase.auth.signUp({ email, password: values.password, options: { emailRedirectTo, data: { full_name: values.name, phone: values.phone } } }); if (error) { setSubmitting(false); setNoticeIsError(true); setEmailForVerification(email); return setNotice(mode === 'login' ? 'Invalid email or password. Verify your email first if you just registered.' : 'We could not create that account. Try logging in or use another email address.'); } if (data.session) { onSession(data.session); navigate('/portal', { replace: true }); return; } setSubmitting(false); setEmailForVerification(email); setNoticeIsError(false); setNotice('Check your Gmail inbox to verify your account. After verification, you will return here to log in.'); };
  const switchMode = () => { if (submitting) return; setNotice(''); setMode(mode === 'login' ? 'register' : 'login'); };
  return <main className="auth-shell"><form key={mode} className={`card-form auth-form auth-form-${mode}`} onSubmit={submit}><Link className="brand" to="/"><span>✦</span> bright<span>smile</span></Link><h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>{mode === 'register' && <><label>Full name<input required name="name" placeholder="Your name" /></label><label>Phone<input required name="phone" minLength="7" placeholder="09XX XXX XXXX" /></label></>}<label>Email<input required type="email" name="email" defaultValue={emailForVerification} placeholder="you@email.com" /></label><label>Password<input required type="password" name="password" minLength="8" placeholder="At least 8 characters" /></label>{mode === 'register' && <label>Confirm password<input required type="password" name="confirmPassword" minLength="8" placeholder="Repeat your password" /></label>}{notice && <p className={noticeIsError ? 'form-error' : 'success'} role="status">{notice}</p>}<button disabled={submitting} className={`button${submitting ? ' is-loading' : ''}`}>{submitting ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : (mode === 'login' ? 'Log in →' : 'Create account →')}</button>{emailForVerification && <button type="button" className="text-button" disabled={submitting} onClick={resend}>Resend verification email</button>}<button type="button" className="text-button" disabled={submitting} onClick={switchMode}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}</button></form></main>;
}

function localDateValue(value) { const date = new Date(value); const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return offsetDate.toISOString().slice(0, 10); }
function localTimeValue(value) { return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); }

function RescheduleForm({ appointment, session, onSaved, onClose }) {
  const [date, setDate] = useState(() => localDateValue(appointment.starts_at));
  const [time, setTime] = useState(() => localTimeValue(appointment.starts_at));
  const [state, setState] = useState({ loading: false, error: '' });
  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, error: '' });
    try {
      const startsAt = new Date(`${date}T${time}:00`);
      const updated = await api(`/appointments/${appointment.id}/reschedule`, { token: session.access_token, method: 'PATCH', body: JSON.stringify({ startsAt: startsAt.toISOString() }) });
      onSaved(updated);
    } catch (error) { setState({ loading: false, error: error.message }); }
  };
  return <form className="reschedule-form" onSubmit={submit}>
    <div><b>Choose a new time</b><p>Your service and dentist will stay the same. Rescheduling is available until 5 hours before your visit.</p></div>
    <div className="form-row"><label>Date<input required type="date" min={localDateValue(new Date())} value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Time<select required value={time} onChange={(event) => setTime(event.target.value)}><option>09:00</option><option>10:00</option><option>11:00</option><option>14:00</option><option>15:00</option><option>16:00</option></select></label></div>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    <div className="reschedule-actions"><button type="submit" className={`button button-small${state.loading ? ' is-loading' : ''}`} disabled={state.loading}>{state.loading ? 'Saving…' : 'Confirm new time'}</button><button type="button" className="text-button" onClick={onClose}>Cancel</button></div>
  </form>;
}

function PatientMessages({ session }) {
  const [messages, setMessages] = useState([]); const [state, setState] = useState({ loading: true, saving: false, error: '', notice: '' });
  const load = () => api('/messages/mine', { token: session.access_token }).then((data) => { setMessages(data); setState((current) => ({ ...current, loading: false, error: '' })); }).catch((error) => setState((current) => ({ ...current, loading: false, error: error.message })));
  useEffect(() => { load(); }, [session]);
  const submit = async (event) => { event.preventDefault(); const formElement = event.currentTarget; const values = Object.fromEntries(new FormData(formElement)); setState((current) => ({ ...current, saving: true, error: '', notice: '' })); try { await api('/messages/mine', { token: session.access_token, method: 'POST', body: JSON.stringify(values) }); formElement.reset(); setState({ loading: false, saving: false, error: '', notice: 'Your message was sent to the clinic.' }); load(); } catch (error) { setState((current) => ({ ...current, saving: false, error: error.message })); } };
  return <section className="appointment-panel patient-messages"><div className="section-heading"><div><h2>Messages with the clinic</h2><p>Send a follow-up and view every reply from the care team.</p></div></div>{state.notice && <p className="success">{state.notice}</p>}{state.error && <p className="form-error">{state.error}</p>}{state.loading ? <LoadingState label="Loading messages"/> : <div className="message-thread">{messages.length ? messages.map((message) => <article key={message.id} className={message.sender_id === session.user.id ? 'message-outgoing' : 'message-incoming'}><b>{message.sender_id === session.user.id ? 'You' : 'Bright Smile Dental'}</b><span>{message.subject}</span><p>{message.message}</p><time>{new Date(message.created_at).toLocaleString()}</time></article>) : <p className="empty">No messages yet. Send the clinic a question below.</p>}</div>}<form className="patient-message-form" onSubmit={submit}><label>Subject<input required name="subject" maxLength="150" placeholder="How can we help?"/></label><label>Message<textarea required name="message" rows="4" maxLength="5000" placeholder="Write your message to the clinic"/></label><button className={`button button-small${state.saving ? ' is-loading' : ''}`} disabled={state.saving}>{state.saving ? 'Sending…' : 'Send message'}</button></form></section>;
}

function Portal({ session }) {
  const [appointments, setAppointments] = useState([]); const [error, setError] = useState(''); const [editing, setEditing] = useState(null); const [notice, setNotice] = useState('');
  useEffect(() => { api('/appointments', { token: session.access_token }).then(setAppointments).catch((e) => setError(e.message)); }, [session]);
  const saveReschedule = (updated) => { setAppointments((items) => items.map((item) => item.id === updated.id ? updated : item)); setEditing(null); setNotice('Your appointment has been rescheduled.'); };
  return <main className="dashboard section"><div className="portal-hero"><div className="portal-header"><div className="eyebrow">Patient portal</div><h1>Your visits, simply managed.</h1><p>Keep your appointments close, your care simple, and your smile moving forward.</p></div><div className="portal-art"><img src={portalCareIllustration} alt="A patient smiling with their dentist during a relaxed dental visit"/><div className="portal-art-note"><span>✦</span> Calm care, one visit at a time.</div></div></div><section className="appointment-panel"><div className="section-heading"><div><h2>Upcoming appointments</h2><p>Need a different time? You can reschedule until 5 hours before your visit.</p></div></div>{notice && <p className="success" role="status">{notice}</p>}{error ? <p className="form-error">{error}</p> : appointments.length ? <div className="appointment-list">{appointments.map((a) => { const canReschedule = ['pending', 'confirmed', 'rescheduled'].includes(a.status) && Date.now() < new Date(a.starts_at).getTime() - 5 * 60 * 60 * 1000; return <article key={a.id} className="patient-appointment"><div><b>{a.services?.name}</b><span>{new Date(a.starts_at).toLocaleString()}</span></div><em>{formatStatus(a.status)}</em><div className="appointment-actions">{canReschedule ? <button className="table-action" onClick={() => { setNotice(''); setEditing(editing === a.id ? null : a.id); }}>Edit / reschedule</button> : <small>{['pending', 'confirmed', 'rescheduled'].includes(a.status) ? 'Rescheduling closes 5 hours before your visit.' : 'This visit cannot be rescheduled.'}</small>}</div>{editing === a.id && <RescheduleForm appointment={a} session={session} onSaved={saveReschedule} onClose={() => setEditing(null)} />}</article>; })}</div> : <div className="empty"><p>No appointments yet.</p><Link to="/book">Book your first visit →</Link></div>}</section><PatientMessages session={session}/></main>;
}

const adminSections = [
  ['dashboard', 'Dashboard'], ['bookings', 'Bookings'], ['calendar', 'Calendar'], ['patients', 'Patients'], ['accounts', 'Accounts'], ['create-account', 'Create customer'], ['messages', 'Messages'], ['dentists', 'Dentists'], ['services', 'Services'], ['activity', 'Activity logs'], ['settings', 'Settings']
];

function AdminDashboard({ session }) {
  const [section, setSection] = useState('dashboard');
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [bookingFormOpen, setBookingFormOpen] = useState(false);
  const token = session.access_token;

  const endpointFor = (view) => ({ bookings: '/admin/bookings', calendar: '/admin/bookings?sort=oldest', patients: '/admin/patients', dentists: '/admin/dentists', services: '/admin/services', accounts: '/admin/accounts', messages: '/admin/messages', activity: '/admin/activity', settings: '/admin/settings' }[view]);
  const load = async (view = section) => {
    setLoading(true); setError('');
    try {
      const endpoint = endpointFor(view);
      const [overviewData, sectionData] = await Promise.all([
        view === 'dashboard' ? api('/admin/overview', { token }) : Promise.resolve(null),
        endpoint ? api(endpoint, { token }) : Promise.resolve([])
      ]);
      if (overviewData) setOverview(overviewData);
      setRows(sectionData);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(section); }, [section]);
  const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesStatus && (!term || JSON.stringify(item).toLowerCase().includes(term));
    });
  }, [items, query, statusFilter]);
  const update = async (path, body, success) => {
    try { await api(path, { token, method: 'PATCH', body: JSON.stringify(body) }); setNotice(success); await load(); }
    catch (e) { setError(e.message); }
  };
  const createService = async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = Object.fromEntries(new FormData(formElement));
    try { await api('/admin/services', { token, method: 'POST', body: JSON.stringify({ name: form.name, description: form.description, price: Number(form.price), durationMinutes: Number(form.durationMinutes), icon: form.icon }) }); formElement.reset(); setNotice('Service created.'); await load(); } catch (e) { setError(e.message); }
  };
  const createDentist = async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const form = Object.fromEntries(new FormData(formElement));
    try { await api('/admin/dentists', { token, method: 'POST', body: JSON.stringify({ fullName: form.fullName, email: form.email, password: form.password, specialty: form.specialty, licenseNumber: form.licenseNumber, phone: form.phone, appointmentDurationMinutes: Number(form.appointmentDurationMinutes) }) }); formElement.reset(); setNotice('Dentist account created.'); await load(); } catch (e) { setError(e.message); }
  };
  const markMessageRead = (messageId) => {
    setRows((current) => Array.isArray(current)
      ? current.map((message) => message.id === messageId ? { ...message, is_read: true } : message)
      : current);
  };
  const navigateSection = (nextSection, { openBooking = false, preserveNotice = false } = {}) => {
    if (!preserveNotice) setNotice('');
    setError('');
    setQuery('');
    setStatusFilter('all');
    setBookingFormOpen(openBooking);
    setSection(nextSection);
  };

  const title = adminSections.find(([id]) => id === section)?.[1] || 'Dashboard';
  return <main className="super-admin">
    <aside className="admin-sidebar"><Link className="brand" to="/"><span>✦</span> bright<span>smile</span></Link><p>Super Admin</p><nav aria-label="Admin navigation">{adminSections.map(([id, label]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => navigateSection(id)}>{label}</button>)}</nav></aside>
    <section className="admin-workspace">
      <header className="admin-topbar"><div><div className="eyebrow">Clinic command center</div><h1>{title}</h1></div><button className="button button-small" onClick={() => navigateSection('bookings', { openBooking: true })}>Create booking</button></header>
      {error && <div className="form-error admin-error" role="alert"><span>{error}</span><button className="table-action" onClick={() => load(section)}>Try again</button></div>}{notice && <div className="success admin-notice" role="status"><span>{notice}</span><button type="button" className="notice-close" onClick={() => setNotice('')} aria-label="Dismiss notification">×</button></div>}
      {loading ? <LoadingState compact label="Loading live clinic data…"/> : <>
        {section === 'dashboard' && (
          <AdminOverview overview={overview} onNavigate={navigateSection}/>
        )}
        {section === 'bookings' && <><div className="booking-admin-actions"><button className="table-action" onClick={() => setBookingFormOpen((open) => !open)}>{bookingFormOpen ? 'Close booking form' : 'New booking'}</button></div>{bookingFormOpen && <AdminBookingForm token={token} onCreated={() => { setNotice('Booking created and sent to the appointment queue.'); setBookingFormOpen(false); load('bookings'); }} onError={setError}/>}<BookingManager rows={visibleRows} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} update={update}/></>} 
        {section === 'calendar' && <CalendarManager rows={visibleRows} query={query} setQuery={setQuery}/>} 
        {section === 'patients' && <PatientManager rows={visibleRows} query={query} setQuery={setQuery} token={token}/>}
        {section === 'accounts' && (
          <AccountManager rows={visibleRows} query={query} setQuery={setQuery} update={update} token={token} onDeleted={() => { setNotice('Customer account deleted. Related patient links were safely removed.'); load('accounts'); }}/>
        )}
        {section === 'create-account' && (
          <CustomerAccountForm token={token} onCreated={() => { setNotice('Customer account created. A verification email was sent if required.'); navigateSection('accounts', { preserveNotice: true }); }}/>
        )}
        {section === 'dentists' && <><form className="admin-create-form" onSubmit={createDentist}><b>Add dentist</b><input required name="fullName" placeholder="Full name"/><input required type="email" name="email" placeholder="Email"/><input required type="password" minLength="12" name="password" placeholder="Temporary password"/><input name="specialty" placeholder="Specialization"/><input name="licenseNumber" placeholder="License number"/><input name="phone" placeholder="Phone"/><input required type="number" min="10" defaultValue="30" name="appointmentDurationMinutes" aria-label="Appointment duration"/><button className="button">Add dentist</button></form><DentistManager rows={visibleRows} query={query} setQuery={setQuery} update={update}/></>}
        {section === 'services' && <><form className="admin-create-form service-create" onSubmit={createService}><b>Add service</b><input required name="name" placeholder="Service name"/><input required type="number" min="0" step="0.01" name="price" placeholder="Price"/><input required type="number" min="10" name="durationMinutes" placeholder="Minutes"/><input name="icon" placeholder="Icon"/><input name="description" placeholder="Short description"/><button className="button">Add service</button></form><ServiceManager rows={visibleRows} query={query} setQuery={setQuery} update={update}/></>}
        {section === 'messages' && <MessagesManager rows={visibleRows} query={query} setQuery={setQuery} token={token} onRead={markMessageRead}/>}
        {section === 'activity' && <RecordList title="Administrative activity" rows={visibleRows} query={query} setQuery={setQuery} kind="activity"/>}
        {section === 'settings' && <SettingsManager settings={rows} update={update}/>} 
      </>}
    </section>
  </main>;
}

function AdminOverview({ overview, onNavigate }) { const counts = overview?.counts || {}; return <><div className="admin-metric-grid">{[{ label: 'Patients', value: counts.totalPatients }, { label: 'Accounts', value: counts.totalAccounts }, { label: 'Dentists', value: counts.totalDentists }, { label: 'Today', value: counts.todayAppointments }, { label: 'Pending', value: counts.pending }, { label: 'Confirmed', value: counts.confirmed }, { label: 'Unread messages', value: counts.unreadMessages }, { label: 'No-show', value: counts.noShow }].map((item) => <article key={item.label}><span>{item.label}</span><b>{item.value ?? 0}</b></article>)}</div><div className="admin-quick-actions"><button onClick={() => onNavigate('create-account')}>Create customer account</button><button onClick={() => onNavigate('patients')}>View patients</button><button onClick={() => onNavigate('messages')}>Open messages</button><button onClick={() => onNavigate('accounts')}>Manage accounts</button><button onClick={() => onNavigate('bookings')}>View all bookings</button></div><div className="admin-split"><section className="admin-card"><h2>Recent bookings</h2>{overview?.recentBookings?.length ? overview.recentBookings.map((booking) => <article key={booking.id}><b>{booking.patient_name}</b><span>{booking.services?.name} · {booking.dentist?.display_name || 'Dentist'}</span><time>{new Date(booking.starts_at).toLocaleString()}</time></article>) : <p>No recent bookings.</p>}</section><section className="admin-card"><h2>Recent activity</h2>{overview?.recentActivity?.length ? overview.recentActivity.map((entry) => <article key={entry.id}><b>{entry.action}</b><span>{entry.entity_type}</span><time>{new Date(entry.created_at).toLocaleString()}</time></article>) : <p>No administrative activity yet.</p>}</section></div></> }
function SearchBar({ query, setQuery, placeholder = 'Search records' }) { return <label className="admin-search"><span>Search</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder}/></label> }
function AdminBookingForm({ token, onCreated, onError }) {
  const [catalog, setCatalog] = useState({ services: [], dentists: [] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { Promise.all([api('/services'), api('/dentists')]).then(([services, dentists]) => setCatalog({ services, dentists })).catch((error) => onError(error.message)); }, [onError]);
  const submit = async (event) => {
    event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); const service = catalog.services.find((item) => item.id === form.serviceId); const startsAt = new Date(`${form.date}T${form.time}:00`); const endsAt = new Date(startsAt.getTime() + (service?.duration_minutes || 30) * 60000);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) return setMessage('Please choose a future appointment time.');
    setSaving(true); setMessage('');
    try { await api('/appointments', { token, method: 'POST', body: JSON.stringify({ serviceId: form.serviceId, dentistId: form.dentistId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), patientName: form.patientName, patientPhone: form.patientPhone, patientEmail: form.patientEmail }) }); onCreated(); }
    catch (error) { setMessage(error.message); } finally { setSaving(false); }
  };
  return <form className="admin-booking-form" onSubmit={submit}><div><div className="eyebrow">New appointment</div><h2>Create a booking</h2><p>Availability is checked before the request is saved.</p></div><div className="admin-booking-fields"><label>Patient name<input required name="patientName" placeholder="Full name"/></label><label>Phone<input required name="patientPhone" placeholder="09XX XXX XXXX"/></label><label>Email<input required type="email" name="patientEmail" placeholder="patient@email.com"/></label><label>Service<select required name="serviceId" defaultValue=""><option value="" disabled>Select service</option>{catalog.services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.duration_minutes} min</option>)}</select></label><label>Dentist<select required name="dentistId" defaultValue=""><option value="" disabled>Select dentist</option>{catalog.dentists.map((dentist) => <option key={dentist.id} value={dentist.id}>{dentist.display_name}</option>)}</select></label><label>Date<input required type="date" min={new Date().toISOString().slice(0, 10)} name="date"/></label><label>Time<select required name="time" defaultValue=""><option value="" disabled>Select time</option>{['09:00','10:00','11:00','14:00','15:00','16:00'].map((time) => <option key={time} value={time}>{time}</option>)}</select></label></div>{message && <p className="form-error" role="alert">{message}</p>}<button disabled={saving || !catalog.services.length || !catalog.dentists.length} className="button">{saving ? 'Saving booking…' : 'Create booking →'}</button></form>;
}
function BookingManager({ rows, query, setQuery, statusFilter, setStatusFilter, update }) { return <section className="admin-card"><div className="admin-controls"><SearchBar query={query} setQuery={setQuery} placeholder="Booking ID, patient, dentist, service, phone, email"/><label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{appointmentStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></label></div><div className="responsive-table booking-table"><div className="table-head"><span>Booking / patient</span><span>Service / dentist</span><span>Date & time</span><span>Status</span><span>Action</span></div>{rows.length ? rows.map((item) => <article key={item.id}><div><b>#{item.id.slice(0, 8)} · {item.patient_name}</b><a href={`mailto:${item.patient_email}`}>{item.patient_email || 'No email'}</a><a href={`tel:${item.patient_phone}`}>{item.patient_phone}</a></div><div><b>{item.services?.name}</b><span>{item.dentist?.display_name || 'Unassigned'}</span></div><time>{new Date(item.starts_at).toLocaleString()}</time><span className={`status-pill status-${item.status}`}>{formatStatus(item.status)}</span><select aria-label={`Update booking for ${item.patient_name}`} value={item.status} onChange={(event) => update(`/admin/bookings/${item.id}`, { status: event.target.value }, 'Booking updated.')}>{appointmentStatuses.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}</select></article>) : <p className="empty">No bookings match your search.</p>}</div></section> }
function CalendarManager({ rows, query, setQuery }) {
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const dayKey = (value) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const appointmentDays = rows.reduce((map, appointment) => {
    const key = dayKey(appointment.starts_at);
    map.set(key, [...(map.get(key) || []), appointment]);
    return map;
  }, new Map());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : new Date(year, monthIndex, index - firstWeekday + 1));
  const activeKey = selectedDay || dayKey(new Date());
  const activeAppointments = appointmentDays.get(activeKey) || [];
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const chooseMonth = (offset) => { setMonth(new Date(year, monthIndex + offset, 1)); setSelectedDay(null); };
  return <section className="calendar-shell">
    <div className="calendar-toolbar"><div><h2>{monthLabel}</h2><p>Click a date to review scheduled visits.</p></div><div className="calendar-actions"><button type="button" onClick={() => chooseMonth(-1)} aria-label="Previous month">←</button><button type="button" onClick={() => { setMonth(new Date()); setSelectedDay(dayKey(new Date())); }}>Today</button><button type="button" onClick={() => chooseMonth(1)} aria-label="Next month">→</button></div></div>
    <SearchBar query={query} setQuery={setQuery} placeholder="Search patient, dentist, or service"/>
    <div className="calendar-layout"><div className="month-grid" role="grid" aria-label={`${monthLabel} appointments`}><div className="calendar-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{cells.map((date, index) => {
      if (!date) return <span className="calendar-empty" aria-hidden="true" key={`empty-${index}`}/>;
      const key = dayKey(date); const events = appointmentDays.get(key) || []; const isToday = key === dayKey(new Date()); const isSelected = key === activeKey;
      return <button type="button" key={key} className={`calendar-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`} onClick={() => setSelectedDay(key)}><time dateTime={key}>{date.getDate()}</time>{events.slice(0, 2).map((event) => <span key={event.id} className={`calendar-event status-${event.status}`}>{new Date(event.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {event.patient_name}</span>)}{events.length > 2 && <span className="calendar-more">+{events.length - 2} more</span>}</button>;
    })}</div></div><aside className="calendar-details"><div className="eyebrow">Selected day</div><h3>{new Date(`${activeKey}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>{activeAppointments.length ? activeAppointments.map((appointment) => <article key={appointment.id}><time>{new Date(appointment.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><div><b>{appointment.patient_name}</b><span>{appointment.services?.name || 'Service'} · {appointment.dentist?.display_name || 'Dentist'}</span></div><span className={`status-pill status-${appointment.status}`}>{formatStatus(appointment.status)}</span></article>) : <p className="empty">No appointments scheduled.</p>}</aside></div></section>
}
function RecordList({ title, rows, query, setQuery, kind }) { return <section className="admin-card"><h2>{title}</h2><SearchBar query={query} setQuery={setQuery}/><div className="record-list">{rows.length ? rows.map((item) => <article key={item.id}><b>{kind === 'patient' ? item.full_name : kind === 'message' ? item.subject : item.action}</b><span>{kind === 'patient' ? `${item.phone || 'No phone'} · ${item.appointmentCount} bookings` : kind === 'message' ? `${item.name} · ${item.email}` : `${item.entity_type} · ${new Date(item.created_at).toLocaleString()}`}</span>{kind === 'message' && <p>{item.message}</p>}</article>) : <p className="empty">No records found.</p>}</div></section> }
function CustomerAccountForm({ token, onCreated }) { const [state, setState] = useState({ saving: false, error: '' }); const submit = async (event) => { event.preventDefault(); const formElement = event.currentTarget; const values = Object.fromEntries(new FormData(formElement)); if (values.password !== values.confirmPassword) return setState({ saving: false, error: 'Passwords do not match.' }); setState({ saving: true, error: '' }); try { await api('/admin/accounts', { token, method: 'POST', body: JSON.stringify(values) }); formElement.reset(); onCreated(); } catch (error) { setState({ saving: false, error: error.message }); } }; return <form className="admin-card customer-account-form" onSubmit={submit}><div className="eyebrow">Secure setup</div><h2>Create customer account</h2><p>The customer receives an email verification link when confirmation is enabled in Supabase. Their password is never displayed after this form is submitted.</p><div className="customer-account-fields"><label>Full name<input required name="fullName" placeholder="Customer name"/></label><label>Email<input required type="email" name="email" placeholder="customer@email.com"/></label><label>Phone<input required name="phone" minLength="7" placeholder="09XX XXX XXXX"/></label><label>Date of birth <small>(optional)</small><input type="date" name="dateOfBirth"/></label><label>Password<input required type="password" minLength="12" name="password" placeholder="At least 12 characters"/></label><label>Confirm password<input required type="password" minLength="12" name="confirmPassword" placeholder="Repeat password"/></label><label className="customer-full-field">Patient notes <small>(optional, visible only to clinic staff)</small><textarea name="medicalNotes" rows="3" maxLength="2000" placeholder="Relevant care notes"/></label><label className="customer-full-field">Address <small>(optional)</small><input name="address" maxLength="300" placeholder="Address"/></label></div>{state.error && <p className="form-error">{state.error}</p>}<button className={`button${state.saving ? ' is-loading' : ''}`} disabled={state.saving}>{state.saving ? 'Creating account…' : 'Create customer account'}</button></form>; }
function AccountManager({ rows, query, setQuery, update, token, onDeleted }) { const [error, setError] = useState(''); const [deleting, setDeleting] = useState(null); const remove = async (item) => { if (item.role !== 'patient') return setError('Only customer/patient accounts can be deleted here.'); if (!window.confirm(`Delete ${item.full_name || item.email}? Their sign-in will be removed while historical appointments and messages are safely retained.`)) return; setDeleting(item.id); setError(''); try { await api(`/admin/accounts/${item.id}`, { token, method: 'DELETE' }); onDeleted(); } catch (requestError) { setError(requestError.message); } finally { setDeleting(null); } }; return <section className="admin-card"><h2>Accounts</h2><p>Customer accounts can be deleted after confirmation. Staff and administrator accounts are protected.</p><SearchBar query={query} setQuery={setQuery} placeholder="Name, email, phone, ID, or role"/>{error && <p className="form-error">{error}</p>}<div className="responsive-table account-table"><div className="table-head"><span>Account</span><span>Role</span><span>Status</span></div>{rows.map((item) => <article key={item.id}><div><b>{item.full_name || 'Unnamed account'}</b><span>{item.email}</span><small>{item.id}</small></div><select value={item.role} onChange={(event) => update(`/admin/accounts/${item.id}`, { role: event.target.value }, 'Role updated.')}>{['patient', 'dentist', 'staff', 'admin'].map((role) => <option key={role} value={role}>{formatStatus(role)}</option>)}</select><div className="account-actions"><button className={item.is_active ? 'table-action danger' : 'table-action'} onClick={() => update(`/admin/accounts/${item.id}`, { isActive: !item.is_active }, item.is_active ? 'Account deactivated.' : 'Account reactivated.')}>{item.is_active ? 'Deactivate' : 'Reactivate'}</button>{item.role === 'patient' && <button className="table-action danger" disabled={deleting === item.id} onClick={() => remove(item)}>{deleting === item.id ? 'Deleting…' : 'Delete'}</button>}</div></article>)}</div></section> }
function PatientManager({ rows, query, setQuery, token }) { const [selected, setSelected] = useState(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const open = async (id) => { setLoading(true); setError(''); try { setSelected(await api(`/admin/patients/${id}`, { token })); } catch (requestError) { setError(requestError.message); } finally { setLoading(false); } }; return <section className="admin-card patient-manager"><h2>Patient records</h2><SearchBar query={query} setQuery={setQuery} placeholder="Search name, phone, or address"/>{error && <p className="form-error">{error}</p>}<div className="record-list">{rows.length ? rows.map((item) => <article key={item.id}><b>{item.full_name}</b><span>{item.phone || 'No phone'} · {item.appointmentCount} bookings</span><button className="table-action" onClick={() => open(item.id)}>Open patient profile</button></article>) : <p className="empty">No patients found.</p>}</div>{loading && <LoadingState label="Opening patient record"/>}{selected && <section className="patient-detail"><div><div className="eyebrow">Patient information</div><h3>{selected.profile.full_name}</h3><p>{selected.profile.phone || 'No phone on file'} · Account created {new Date(selected.profile.created_at).toLocaleDateString()}</p><p>{selected.profile.address || 'No address on file'}</p>{selected.profile.medical_notes && <p><b>Clinical notes:</b> {selected.profile.medical_notes}</p>}</div><button className="text-button" onClick={() => setSelected(null)}>Close profile</button><div className="patient-history"><h3>Appointment history</h3>{selected.appointments.length ? selected.appointments.map((appointment) => <article key={appointment.id}><b>{appointment.services?.name || 'Service'} · {formatStatus(appointment.status)}</b><span>{new Date(appointment.starts_at).toLocaleString()} · {appointment.dentist?.display_name || 'Dentist'}</span><p>{appointment.notes || 'No additional booking notes.'}</p></article>) : <p>No appointments associated with this patient.</p>}</div></section>}</section>; }
function MessagesManager({ rows, query, setQuery, token, onRead }) {
  const [thread, setThread] = useState(null);
  const [state, setState] = useState({ loading: false, saving: false, error: '', notice: '', deliveryFallback: null });
  const [emailStatus, setEmailStatus] = useState({ loading: true, testing: false, data: null, result: null });

  const loadEmailStatus = () => api('/admin/email/status', { token })
    .then((data) => setEmailStatus((current) => ({ ...current, loading: false, data })))
    .catch(() => setEmailStatus((current) => ({ ...current, loading: false, data: { automaticEmail: 'failed', gmailDraftFallback: 'available' } })));
  useEffect(() => { loadEmailStatus(); }, [token]);
  const testEmail = async () => {
    setEmailStatus((current) => ({ ...current, testing: true, result: null }));
    try { const result = await api('/admin/email/test', { token, method: 'POST' }); setEmailStatus((current) => ({ ...current, testing: false, result })); }
    catch (error) { setEmailStatus((current) => ({ ...current, testing: false, result: { sent: false, provider: 'resend', error: error.message, testedAt: new Date().toISOString() } })); }
  };

  const open = async (id) => {
    setState({ loading: true, saving: false, error: '', notice: '', deliveryFallback: null });
    try {
      const conversation = await api(`/admin/messages/${id}`, { token });
      setThread(conversation);
      onRead(id);
      setState({ loading: false, saving: false, error: '', notice: '', deliveryFallback: null });
    } catch (error) {
      setState({ loading: false, saving: false, error: error.message, notice: '', deliveryFallback: null });
    }
  };

  const reply = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const value = new FormData(formElement).get('message');
    setState((current) => ({ ...current, saving: true, error: '', notice: '', deliveryFallback: null }));
    try {
      const created = await api(`/admin/messages/${thread.root.id}/replies`, {
        token,
        method: 'POST',
        body: JSON.stringify({ message: value })
      });
      setThread((current) => ({ ...current, messages: [...current.messages, created] }));
      formElement.reset();
      setState({
        loading: false,
        saving: false,
        error: created.emailSent ? '' : `Reply was saved, but automatic email delivery failed. ${created.emailError || 'Open the email draft below to send it manually.'}`,
        notice: created.emailSent ? 'Reply saved and emailed to the customer.' : '',
        deliveryFallback: created.emailSent ? null : { email: created.email, subject: thread.root.subject, message: value }
      });
    } catch (error) {
      setState((current) => ({ ...current, saving: false, error: error.message }));
    }
  };

  const mailtoHref = state.deliveryFallback?.email
    ? `mailto:${encodeURIComponent(state.deliveryFallback.email)}?subject=${encodeURIComponent(`Bright Smile Dental: ${state.deliveryFallback.subject}`)}&body=${encodeURIComponent(`Hello ${thread?.root?.name || 'there'},\n\nOur clinic team replied to your message:\n\n${state.deliveryFallback.message}\n\nBright Smile Dental`)}`
    : null;
  const gmailDraftHref = state.deliveryFallback?.email
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(state.deliveryFallback.email)}&su=${encodeURIComponent(`Bright Smile Dental: ${state.deliveryFallback.subject}`)}&body=${encodeURIComponent(`Hello ${thread?.root?.name || 'there'},\n\nOur clinic team replied to your message:\n\n${state.deliveryFallback.message}\n\nBright Smile Dental`)}`
    : null;

  const emailMode = emailStatus.data?.automaticEmail;
  const emailLabel = emailStatus.loading ? 'Checking…' : emailMode === 'connected' ? 'Connected' : emailMode === 'testing_only' ? 'Testing only' : emailMode === 'domain_required' ? 'Domain required' : 'Not configured';
  return <section className="admin-card messages-manager">
    <h2>Customer messages</h2>
    <div className="email-status" aria-live="polite"><span>Automatic email: <b>{emailLabel}</b></span><span>Gmail draft fallback: <b>Available</b></span><button type="button" className="table-action" disabled={emailStatus.testing} onClick={testEmail}>{emailStatus.testing ? 'Sending test…' : 'Send test email'}</button></div>
    {emailStatus.data?.message && <p className={emailMode === 'connected' ? 'email-status-note' : 'form-error'} role="status">{emailStatus.data.message}</p>}
    {emailStatus.result && <p className={emailStatus.result.sent ? 'success' : 'form-error'} role="status">{emailStatus.result.sent ? `Test email sent through ${emailStatus.result.provider} at ${new Date(emailStatus.result.testedAt).toLocaleString()}.` : `Test email failed: ${emailStatus.result.error}`}</p>}
    <SearchBar query={query} setQuery={setQuery} placeholder="Search customer, email, subject, or message"/>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {mailtoHref && <div className="email-fallback-actions"><a className="table-action" href={gmailDraftHref} target="_blank" rel="noreferrer">Open Gmail draft</a><a className="table-action" href={mailtoHref}>Open email app</a></div>}
    {state.notice && <p className="success" role="status">{state.notice}</p>}
    <div className="message-admin-layout">
      <div className="record-list message-inbox">
        {rows.length ? rows.map((item) => <article key={item.id} className={!item.is_read ? 'unread' : ''}>
          <b>{item.subject}</b><span>{item.name} · {item.email}</span><p>{item.message}</p>
          <button type="button" className="table-action" onClick={() => open(item.id)}>Open conversation</button>
        </article>) : <p className="empty">No customer inquiries found.</p>}
      </div>
      <div className="admin-thread">
        {state.loading ? <LoadingState label="Loading conversation"/> : thread ? <>
          <h3>{thread.root.subject}</h3>
          {thread.messages.map((message) => {
            const fromAdmin = Boolean(message.sender_id && message.sender_id !== thread.root.patient_id);
            return <article key={message.id} className={fromAdmin ? 'message-incoming' : 'message-outgoing'}><b>{fromAdmin ? 'Bright Smile Dental' : message.name}</b><p>{message.message}</p><time>{new Date(message.created_at).toLocaleString()}</time></article>;
          })}
          <form onSubmit={reply}><label>Reply<textarea required name="message" rows="4" maxLength="5000" placeholder="Write a helpful reply"/></label><button className={`button button-small${state.saving ? ' is-loading' : ''}`} disabled={state.saving}>{state.saving ? 'Sending…' : 'Send reply'}</button></form>
        </> : <p className="empty">Select a customer inquiry to view its conversation and reply.</p>}
      </div>
    </div>
  </section>;
}
function DentistManager({ rows, query, setQuery, update }) { return <section className="admin-card"><h2>Dentist directory</h2><SearchBar query={query} setQuery={setQuery} placeholder="Search dentists"/><div className="record-list">{rows.map((item) => <article key={item.id}><b>{item.display_name}</b><span>{item.specialty || 'General dentistry'} · {item.license_number || 'No license recorded'}</span><span>{item.email || 'No email'} · {item.phone || 'No phone'}</span><button className="table-action" onClick={() => update(`/admin/dentists/${item.id}`, { isActive: !item.is_active }, item.is_active ? 'Dentist deactivated. Future bookings are blocked.' : 'Dentist reactivated.')}>{item.is_active ? 'Deactivate' : 'Reactivate'}</button></article>)}</div></section> }
function ServiceManager({ rows, query, setQuery, update }) { return <section className="admin-card"><h2>Services</h2><SearchBar query={query} setQuery={setQuery} placeholder="Search services"/><div className="record-list">{rows.map((item) => <article key={item.id}><b>{item.icon || '✦'} {item.name}</b><span>₱{item.price} · {item.duration_minutes} minutes</span><p>{item.description}</p><button className="table-action" onClick={() => update(`/admin/services/${item.id}`, { isActive: !item.is_active }, item.is_active ? 'Service deactivated.' : 'Service reactivated.')}>{item.is_active ? 'Deactivate' : 'Reactivate'}</button></article>)}</div></section> }
function SettingsManager({ settings, update }) { const submit = (event) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); update('/admin/settings', { clinicName: form.clinicName, address: form.address || null, phone: form.phone || null, email: form.email || null, timezone: form.timezone, appointmentIntervalMinutes: Number(form.appointmentIntervalMinutes), allowOnlineBooking: form.allowOnlineBooking === 'on', cancellationNoticeHours: Number(form.cancellationNoticeHours) }, 'Clinic settings saved.'); }; return <form className="admin-card settings-form" onSubmit={submit}><h2>Clinic settings</h2><label>Clinic name<input required name="clinicName" defaultValue={settings.clinic_name}/></label><label>Address<input name="address" defaultValue={settings.address || ''}/></label><label>Phone<input name="phone" defaultValue={settings.phone || ''}/></label><label>Email<input name="email" type="email" defaultValue={settings.email || ''}/></label><label>Timezone<input required name="timezone" defaultValue={settings.timezone}/></label><label>Booking interval (minutes)<input required type="number" min="5" name="appointmentIntervalMinutes" defaultValue={settings.appointment_interval_minutes}/></label><label>Cancellation notice (hours)<input required type="number" min="0" name="cancellationNoticeHours" defaultValue={settings.cancellation_notice_hours}/></label><label className="toggle-label"><input type="checkbox" name="allowOnlineBooking" defaultChecked={settings.allow_online_booking}/> Allow online booking</label><button className="button">Save settings</button></form> }

function App() { const [session, setSession] = useState(null); const [profile, setProfile] = useState(null); const [authLoading, setAuthLoading] = useState(true); const [profileLoading, setProfileLoading] = useState(false); const [signingOut, setSigningOut] = useState(false); useEffect(() => { if (!supabase) { setAuthLoading(false); return; } supabase.auth.getSession().then(({ data }) => setSession(data.session)).finally(() => setAuthLoading(false)); const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthLoading(false); }); return () => listener.subscription.unsubscribe(); }, []); useEffect(() => { if (!session) { setProfile(null); setProfileLoading(false); return; } setProfileLoading(true); api('/auth/me', { token: session.access_token }).then(setProfile).catch(() => setProfile(null)).finally(() => setProfileLoading(false)); }, [session]); const signOut = async () => { if (signingOut) return; setSigningOut(true); try { await supabase?.auth.signOut(); setSession(null); } finally { setSigningOut(false); } }; const loadingRoute = <main className="route-loading"><LoadingState label="Loading your account…"/></main>; const profileRouteLoading = <main className="route-loading"><LoadingState label="Loading your dashboard…"/></main>; const adminRoute = authLoading ? loadingRoute : !session ? <Navigate to="/login" replace/> : profileLoading ? profileRouteLoading : profile?.role === 'admin' ? <AdminDashboard session={session}/> : <Navigate to="/" replace/>; const portalRoute = authLoading ? loadingRoute : !session ? <Navigate to="/login" replace/> : profileLoading ? profileRouteLoading : profile?.role === 'admin' ? <Navigate to="/admin" replace/> : <Portal session={session}/>; const signedInDestination = profile?.role === 'admin' ? '/admin' : '/portal'; return <><Header session={session} profile={profile} onSignOut={signOut} signingOut={signingOut}/><Routes><Route path="/" element={<Home/>}/><Route path="/services" element={<Services/>}/><Route path="/about" element={<About/>}/><Route path="/contact" element={<Contact/>}/><Route path="/book" element={<Book session={session}/>}/><Route path="/login" element={authLoading ? loadingRoute : session ? profileLoading ? profileRouteLoading : <Navigate to={signedInDestination} replace/> : <Login onSession={setSession}/>}/><Route path="/portal" element={portalRoute}/><Route path="/admin" element={adminRoute}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes><footer><span className="brand"><span>✦</span> bright<span>smile</span></span><p>Thoughtful dentistry for brighter days.</p><p>© 2026 Bright Smile Dental Clinic</p></footer></> }

createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><App/></BrowserRouter></StrictMode>);
