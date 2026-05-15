
import { ApiError } from "../utils/apiError";

// errorMiddleware.js - used to handle errors thrown in the controllers and send appropriate responses to the client

const errorMiddleware = (err, req, res, next) => {
if(err instanceof ApiError) {
return res.status(err.statusCode).json({
  status: err.status,
  message: err.message,
  data: err.data
})
} 

// handle mongoose duplicate key errors
if (err.code === 11000 || err.code === 11001) {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];

  return res.status(409).json({
    status: 'error',
    data: null,
    message: `Duplicate value for field '${field}': '${value}'`
  });
}
  
// handle mongoose cast errors
if (err.name === 'CastError') {
  return res.status(400).json({
    status: 'error',
    data: null,
    message: `Invalid value for field '${err.path}': '${err.value}'`
  });
}

// handle mongoose validation errors
if (err.name === 'ValidationError') {
  const errors = Object.values(err.errors).map(e => e.message);
  return res.status(400).json({
    status: 'error',
    data: null,
    message: `Validation error: ${errors.join(', ')}`
  });
}

// for debugging unhandled errors
console.error("Unhandled error:", err);

// handle generic errors
return res.status(500).json({
  status: 'error',
  data: null,
  message: err.message || 'Internal Server Error'
});

}

export {errorMiddleware}