// apiError.js - used to throw errors in the controllers and handle them in the error middleware

class ApiError extends Error {
  constructor(statusCode, message, status = "error") {
    super(message);
    this.statusCode = statusCode;
    this.status = status;
    this.data = null;
    this.message = message;
  }
}

export { ApiError };
