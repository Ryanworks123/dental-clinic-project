import app from '../server/index.js';

// Vercel rewrites every /api/* request here. Restore the requested API path
// before Express handles it, so production uses exactly the same routes as
// the local Node server.
export default function apiGateway(request, response) {
  const { path, ...query } = request.query || {};
  const segments = Array.isArray(path) ? path : String(path || '').split('/').filter(Boolean);
  const pathname = segments.join('/');
  const search = new URLSearchParams(query).toString();

  request.url = `/api/${pathname}${search ? `?${search}` : ''}`;
  return app(request, response);
}
