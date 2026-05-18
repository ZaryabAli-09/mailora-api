import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export async function sendOtpEmail(email, otp) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Mailora OTP Code",
      html: `
        <h2>Email Verification</h2>
        <p>Your OTP code is:</p>
        <h1 style="color: #007bff; letter-spacing: 2px;">${otp}</h1>
        <p>This code expires in 5 minutes.</p>
        <p>If you didn't request this, ignore this email.</p>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`Failed to send OTP to ${email}:`, error);
    return false;
  }
}
