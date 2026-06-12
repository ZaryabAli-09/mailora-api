// mailoraSend.d.ts - TypeScript definitions for mailoraSend utility

/**
 * Configuration options for the mailoraSend function
 */
export interface MailoraSendOptions {
  /**
   * Your Mailora API key (sk_live_*)
   */
  apiKey: string;

  /**
   * ID of the email template to use
   */
  templateId: string;

  /**
   * Single email address or array of email addresses
   */
  recipients: string | string[];

  /**
   * Object with key-value pairs for template variables
   */
  variables?: Record<string, string | number | boolean>;

  /**
   * Email provider to use (gmail or domain)
   * @default "gmail"
   */
  provider?: "gmail" | "domain";

  /**
   * Additional metadata to store with the job
   */
  metadata?: Record<string, any>;

  /**
   * Custom Mailora API URL (optional)
   * @default "http://localhost:8000/api/v1/integrations/send-email"
   */
  apiUrl?: string;
}

/**
 * Response from the mailoraSend function
 */
export interface MailoraSendResponse {
  status: "success";
  data: {
    jobId: string;
    status: "pending";
    recipients: number;
    provider: "gmail" | "domain";
  };
  message: string;
}

/**
 * Sends an email through the Mailora email engine
 *
 * @param options - Configuration options
 * @returns Promise that resolves with job details
 */
export function mailoraSend(
  options: MailoraSendOptions,
): Promise<MailoraSendResponse>;

/**
 * Default export of the mailoraSend function
 */
export default mailoraSend;
