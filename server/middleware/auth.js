import { AppError } from '../errors.js';
import { supabase } from '../supabase.js';

export async function requireAuth(request, _response, next) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next(new AppError(401, 'Authentication is required.'));
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return next(new AppError(401, 'Your session is invalid or expired.'));
  request.user = data.user;
  next();
}

export async function loadRole(request, _response, next) {
  let { data, error } = await supabase.from('profiles').select('role, is_active').eq('id', request.user.id).maybeSingle();
  if (error?.code === '42703') ({ data, error } = await supabase.from('profiles').select('role').eq('id', request.user.id).maybeSingle());
  if (error) return next(new AppError(403, 'Unable to determine your account role.'));

  // Direct Supabase sign-up does not create a profile in older database setups.
  // Provision a safe patient profile on first authenticated API request.
  if (!data) {
    const fullName = request.user.user_metadata?.full_name?.trim()
      || request.user.email?.split('@')[0]
      || 'Patient';
    const created = await supabase.from('profiles')
      .upsert({ id: request.user.id, full_name: fullName, role: 'patient' })
      .select('role')
      .single();
    if (created.error) return next(new AppError(403, 'Unable to create your patient profile.'));
    data = created.data;

    const patientResult = await supabase.from('patients').upsert({ id: request.user.id });
    if (patientResult.error) return next(new AppError(500, 'Unable to create your patient record.'));
  }

  if (data.is_active === false) return next(new AppError(403, 'This account has been deactivated.'));
  request.role = data.role;
  next();
}

export function allowRoles(...roles) {
  return (request, _response, next) => roles.includes(request.role)
    ? next()
    : next(new AppError(403, 'You do not have permission to perform this action.'));
}
