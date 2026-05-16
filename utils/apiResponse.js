// apiResponse.js - used to send success responses in the controllers

class ApiResponse {
  constructor(data, message, status = "success") {
    this.data = data;
    this.message = message;
    this.status = status;
  }
}

export function successResponse(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  })
}

export function errorResponse(res, message = 'Error', statusCode = 400, errors = null, errorType = null) {
  const payload = {
    success: false,
    message,
  }

  if (errorType) {
    payload.errorType = errorType
  }

  if (errors !== null) {
    payload.errors = errors
  }

  return res.status(statusCode).json(payload)
}

export { ApiResponse };
