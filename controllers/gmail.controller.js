import jwt from "jsonwebtoken";
import { GmailConnection } from "../models/gmailConnection.model.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { encryptSecret } from "../utils/crypto.js";

// Gmail integration notes:
// 1. The user starts the OAuth flow by calling /gmail/connect-url.
// 2. Google returns an authorization code to /gmail/callback.
// 3. The server exchanges that code for tokens and stores the encrypted refresh token.
// 4. The Gmail mailbox record is then saved for the current user.
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
];

function requireGoogleOauthConfig() {
  // Debug logging is intentionally commented out to avoid noisy server output.
  // console.log(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new ApiError(
      500,
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function sanitizeMailbox(mailbox) {
  return {
    id: mailbox._id,
    userId: mailbox.userId,
    provider: mailbox.provider,
    emailAddress: mailbox.emailAddress,
    displayName: mailbox.displayName,
    googleAccountId: mailbox.googleAccountId,
    scopes: mailbox.scopes,
    pictureUrl: mailbox.pictureUrl,
    status: mailbox.status,
    lastConnectedAt: mailbox.lastConnectedAt,
    lastRefreshedAt: mailbox.lastRefreshedAt,
    revokedAt: mailbox.revokedAt,
    metadata: mailbox.metadata,
    createdAt: mailbox.createdAt,
    updatedAt: mailbox.updatedAt,
  };
}

export async function getGmailConnectUrl(req, res, next) {
  // This endpoint creates the Google OAuth URL that the frontend opens.
  // It prevents duplicate Gmail connections for the same user in single-mailbox mode.
  try {
    const { clientId, redirectUri } = requireGoogleOauthConfig();

    // single-mailbox: check if a connection already exists
    const existingMailbox = await GmailConnection.findOne({
      userId: req.user._id,
      status: "connected",
    });

    if (existingMailbox) {
      throw new ApiError(
        400,
        `Gmail is already connected (${existingMailbox.emailAddress}). Use the replace endpoint to change it.`,
      );
    }

    const state = jwt.sign(
      { userId: req.user._id, purpose: "gmail-connect" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    return res.json(
      new ApiResponse(
        {
          authUrl: authUrl.toString(),
          scopes: GOOGLE_SCOPES,
        },
        "Google connect URL generated successfully",
        200,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function replaceGmailConnection(req, res, next) {
  // This endpoint is used to reconnect Gmail after an existing mailbox is already linked.
  // The old token record is not removed yet; the callback update replaces it safely.
  try {
    // Note: We don't revoke here because we want the old connection to keep working
    // until the new one is successfully authenticated in the callback.
    // The handleGmailCallback will use findOneAndUpdate by userId, which replaces the record.

    const { clientId, redirectUri } = requireGoogleOauthConfig();
    const state = jwt.sign(
      { userId: req.user._id, purpose: "gmail-connect" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" },
    );

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    return res.json(
      new ApiResponse(
        {
          authUrl: authUrl.toString(),
          scopes: GOOGLE_SCOPES,
        },
        "Replacement Google connect URL generated successfully",
        200,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function handleGmailCallback(req, res, next) {
  // Main Gmail callback flow:
  // 1. Validate the OAuth callback parameters and signed JWT state.
  // 2. Exchange the Google authorization code for access/refresh tokens.
  // 3. Fetch the user's Google profile email and display name.
  // 4. Store or update the Gmail connection record for this user.
  try {
    const { clientId, clientSecret, redirectUri } = requireGoogleOauthConfig();
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      throw new ApiError(400, `Google OAuth failed: ${oauthError}`);
    }

    if (!code || !state) {
      throw new ApiError(400, "Missing Google OAuth code or state");
    }

    const decodedState = jwt.verify(state, process.env.JWT_SECRET);
    if (decodedState?.purpose !== "gmail-connect") {
      throw new ApiError(400, "Invalid Google OAuth state");
    }

    if (String(decodedState.userId) !== String(req.user._id)) {
      throw new ApiError(
        403,
        "Google OAuth state does not match the logged-in user",
      );
    }

    // Step 2: Exchange the short-lived Google authorization code for real OAuth tokens.
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new ApiError(
        400,
        tokenData?.error_description ||
          tokenData?.error ||
          "Failed to exchange Google OAuth code",
      );
    }

    // Step 3: Ask Google for the signed-in account identity so we can save the mailbox email.
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      },
    );

    const userInfo = await userInfoResponse.json();
    if (!userInfoResponse.ok) {
      throw new ApiError(
        400,
        userInfo?.error?.message ||
          "Failed to fetch Google profile information",
      );
    }

    const emailAddress = String(userInfo.email || "")
      .toLowerCase()
      .trim();
    if (!emailAddress) {
      throw new ApiError(400, "Google account email was not returned by OAuth");
    }

    // Step 4: Store the Gmail connection record for the logged-in user.
    // We keep the old refresh token only when the Google account email matches the current record.
    const existingMailbox = await GmailConnection.findOne({
      userId: req.user._id,
    });

    // Only reuse existing refresh token if it's the same email address
    let refreshTokenEncrypted = tokenData.refresh_token
      ? encryptSecret(tokenData.refresh_token)
      : null;

    if (
      !refreshTokenEncrypted &&
      existingMailbox &&
      existingMailbox.emailAddress === emailAddress
    ) {
      refreshTokenEncrypted = existingMailbox.refreshTokenEncrypted;
    }

    if (!refreshTokenEncrypted) {
      throw new ApiError(
        400,
        "Google did not return a refresh token. Please ensure you approve offline access.",
      );
    }

    const mailbox = await GmailConnection.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          provider: "gmail",
          emailAddress,
          displayName: userInfo.name || emailAddress,
          googleAccountId: userInfo.id,
          refreshTokenEncrypted,
          accessTokenEncrypted: encryptSecret(tokenData.access_token),
          accessTokenExpiresAt: new Date(
            Date.now() + (tokenData.expires_in || 0) * 1000,
          ),
          scopes: String(tokenData.scope || "")
            .split(" ")
            .filter(Boolean),
          pictureUrl: userInfo.picture,
          status: "connected",
          lastConnectedAt: new Date(),
          lastRefreshedAt: new Date(),
          revokedAt: null,
          metadata: {
            tokenType: tokenData.token_type,
            idToken: tokenData.id_token ? true : false,
          },
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return res.json(
      new ApiResponse(
        {
          mailbox: sanitizeMailbox(mailbox),
        },
        "Gmail connected successfully",
        200,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function listGmailMailboxes(req, res, next) {
  try {
    // single-mailbox: return the single mailbox if present
    const mailboxes = await GmailConnection.find({ userId: req.user._id }).sort(
      { createdAt: -1 },
    );

    return res.json(
      new ApiResponse(
        mailboxes.map(sanitizeMailbox),
        "Gmail mailboxes retrieved successfully",
        200,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function getGmailMailbox(req, res, next) {
  try {
    const mailbox = await GmailConnection.findOne({
      _id: req.params.mailboxId,
      userId: req.user._id,
    });

    if (!mailbox) {
      throw new ApiError(404, "Gmail mailbox not found");
    }

    return res.json(
      new ApiResponse(
        sanitizeMailbox(mailbox),
        "Gmail mailbox retrieved successfully",
        200,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function setDefaultGmailMailbox(req, res, next) {
  // Single-mailbox mode: endpoint unsupported
  return next(
    new ApiError(
      404,
      "Setting default mailbox is not supported in single-mailbox mode.",
    ),
  );
}

export async function disconnectGmailMailbox(req, res, next) {
  try {
    const mailbox = await GmailConnection.findOne({
      _id: req.params.mailboxId,
      userId: req.user._id,
    });

    if (!mailbox) {
      throw new ApiError(404, "Gmail mailbox not found");
    }

    mailbox.status = "revoked";
    mailbox.revokedAt = new Date();
    mailbox.accessTokenEncrypted = undefined;
    mailbox.accessTokenExpiresAt = undefined;
    await mailbox.save();

    return res.json(
      new ApiResponse(
        sanitizeMailbox(mailbox),
        "Gmail mailbox disconnected successfully",
        200,
      ),
    );
  } catch (error) {
    next(error);
  }
}
