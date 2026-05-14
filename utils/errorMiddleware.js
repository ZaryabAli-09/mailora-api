import { errorResponse } from './apiResponse.js'

export function notFoundHandler(req, res, next) {
  next({ statusCode: 404, message: 'Resource not found' })
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }

  const statusCode = err.statusCode || err.status || 500
  const message = err.message || 'Internal server error'
  const errors = err.errors || null

  console.error(err.stack || err)
  return errorResponse(res, message, statusCode, errors)
}
