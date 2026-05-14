import { errorResponse } from './apiResponse.js'

function normalizeError(err) {
  const normalized = {
    statusCode: err.statusCode || err.status || 500,
    message: err.message || 'Internal server error',
    errors: err.errors || null,
    errorType: err.type || err.name || 'Error',
  }

  if (err.name === 'ValidationError') {
    normalized.statusCode = 400
    normalized.errorType = 'ValidationError'
    normalized.errors = Object.values(err.errors || {}).map((item) => ({
      field: item.path,
      message: item.message,
    }))
  } else if (err.name === 'CastError') {
    normalized.statusCode = 400
    normalized.errorType = 'CastError'
    normalized.message = err.message || `Invalid value for ${err.path}`
  } else if (err.name === 'SyntaxError' && err.status === 400 && 'body' in err) {
    normalized.statusCode = 400
    normalized.errorType = 'BadJson'
    normalized.message = 'Malformed JSON payload'
  } else if (err.name === 'JsonWebTokenError') {
    normalized.statusCode = 401
    normalized.errorType = 'JsonWebTokenError'
    normalized.message = 'Invalid authentication token'
  } else if (err.name === 'TokenExpiredError') {
    normalized.statusCode = 401
    normalized.errorType = 'TokenExpiredError'
    normalized.message = 'Authentication token expired'
  } else if (err.code === 11000) {
    normalized.statusCode = 409
    normalized.errorType = 'DuplicateKeyError'
    normalized.message = 'Duplicate field value entered'
    normalized.errors = [{
      fields: Object.keys(err.keyValue || {}).join(', '),
      value: err.keyValue,
    }]
  } else if (err.name === 'MongoServerError') {
    normalized.errorType = 'MongoServerError'
    normalized.message = err.message || normalized.message
  }

  if (normalized.statusCode < 400 || normalized.statusCode > 599) {
    normalized.statusCode = 500
  }

  return normalized
}

export function notFoundHandler(req, res, next) {
  next({ statusCode: 404, message: 'Resource not found', type: 'NotFoundError' })
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }

  const { statusCode, message, errors, errorType } = normalizeError(err)

  console.error(err.stack || err)
  return errorResponse(res, message, statusCode, errors, errorType)
}
