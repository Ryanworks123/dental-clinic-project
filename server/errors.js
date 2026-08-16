export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function errorHandler(error, _request, response, _next) {
  if (['42P01', '42703', 'PGRST205'].includes(error?.code)) {
    return response.status(503).json({
      error: { message: 'A required clinic database migration has not been applied. Run the SQL files in supabase/migrations in order, then restart the API.' }
    });
  }
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  response.status(status).json({
    error: { message: error instanceof AppError ? error.message : (status >= 500 ? 'An unexpected server error occurred.' : error.message), details: error.details }
  });
}
