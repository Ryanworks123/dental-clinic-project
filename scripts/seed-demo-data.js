import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const demoEmail = 'demo.dentist@brightsmile.test';
const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

let dentistUser = users.users.find((user) => user.email === demoEmail);
if (!dentistUser) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: demoEmail,
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
    user_metadata: { full_name: 'Dr. Mia Santos' }
  });
  if (error) throw error;
  dentistUser = data.user;
}

const { error: profileError } = await supabase.from('profiles').upsert({
  id: dentistUser.id,
  full_name: 'Dr. Mia Santos',
  role: 'dentist'
});
if (profileError) throw profileError;

const { error: dentistError } = await supabase.from('dentists').upsert({
  id: dentistUser.id,
  display_name: 'Dr. Mia Santos',
  specialty: 'General & Family Dentistry',
  bio: 'Demo dentist profile for booking-flow testing.',
  is_active: true
});
if (dentistError) throw dentistError;

const services = [
  { name: 'Dental Cleaning', description: 'A gentle routine cleaning for healthier teeth and gums.', duration_minutes: 45, price: 1200 },
  { name: 'Teeth Whitening', description: 'Professional whitening designed for natural-looking brightness.', duration_minutes: 60, price: 4500 },
  { name: 'Dental Fillings', description: 'Comfortable treatment with tooth-colored restorative materials.', duration_minutes: 45, price: 1800 },
  { name: 'Orthodontics', description: 'A thoughtful path toward a healthier, more confident smile.', duration_minutes: 60, price: 0 },
  { name: 'Root Canal Treatment', description: 'Relief-focused treatment to protect and save your natural tooth.', duration_minutes: 90, price: 6500 },
  { name: 'Pediatric Dentistry', description: 'Happy, gentle first visits for our smallest patients.', duration_minutes: 30, price: 1000 }
].map((service) => ({ ...service, is_active: true }));

const { error: serviceError } = await supabase.from('services').upsert(services, { onConflict: 'name' });
if (serviceError) throw serviceError;

console.log('Demo dentist and booking services are ready.');
