export function successResponse(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  })
}

export function errorResponse(res, message = 'Error', statusCode = 400, errors = null) {
  const payload = {
    success: false,
    message,
  }

  if (errors !== null) {
    payload.errors = errors
  }

  return res.status(statusCode).json(payload)
}
