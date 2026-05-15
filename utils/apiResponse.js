// apiResponse.js - used to send success responses in the controllers

class ApiResponse{
  constructor(data,message,status="success"){
    this.data=data;
    this.message=message;
    this.status=status;
  }
}