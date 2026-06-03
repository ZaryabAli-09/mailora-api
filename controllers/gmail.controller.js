import jwt from "jsonwebtoken";
import { GmailConnection } from "../models/gmailConnection.model.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { encryptSecret } from "../utils/crypto.js";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid",
];

function requireGoogleOauthConfig() {
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
    isDefault: mailbox.isDefault,
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
  try {
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
        "Google connect URL generated successfully",
        200,
      ),
    );
  } catch (error) {
    next(error);
  }
}

export async function handleGmailCallback(req, res, next) {
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

    const existingMailbox = await GmailConnection.findOne({
      userId: req.user._id,
      emailAddress,
    });

    const refreshTokenEncrypted = tokenData.refresh_token
      ? encryptSecret(tokenData.refresh_token)
      : existingMailbox?.refreshTokenEncrypted;

    if (!refreshTokenEncrypted) {
      throw new ApiError(
        400,
        "Google did not return a refresh token. Reconnect the account and approve offline access.",
      );
    }

    const hasDefaultMailbox = await GmailConnection.exists({
      userId: req.user._id,
      isDefault: true,
      status: "connected",
    });

    const mailbox = await GmailConnection.findOneAndUpdate(
      { userId: req.user._id, emailAddress },
      {
        $set: {
          provider: "gmail",
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
          isDefault: hasDefaultMailbox
            ? existingMailbox?.isDefault || false
            : true,
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
    const mailboxes = await GmailConnection.find({ userId: req.user._id }).sort(
      {
        isDefault: -1,
        createdAt: -1,
      },
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
  try {
    const mailbox = await GmailConnection.findOne({
      _id: req.params.mailboxId,
      userId: req.user._id,
    });

    if (!mailbox) {
      throw new ApiError(404, "Gmail mailbox not found");
    }

    await GmailConnection.updateMany(
      { userId: req.user._id },
      { $set: { isDefault: false } },
    );

    mailbox.isDefault = true;
    mailbox.status = "connected";
    await mailbox.save();

    return res.json(
      new ApiResponse(
        sanitizeMailbox(mailbox),
        "Default Gmail mailbox updated successfully",
        200,
      ),
    );
  } catch (error) {
    next(error);
  }
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
    mailbox.isDefault = false;
    mailbox.accessTokenEncrypted = undefined;
    mailbox.accessTokenExpiresAt = undefined;
    await mailbox.save();

    const remainingActiveDefault = await GmailConnection.findOne({
      userId: req.user._id,
      isDefault: true,
      status: "connected",
    });

    if (!remainingActiveDefault) {
      const fallbackMailbox = await GmailConnection.findOne({
        userId: req.user._id,
        status: "connected",
      }).sort({ createdAt: 1 });

      if (fallbackMailbox) {
        fallbackMailbox.isDefault = true;
        await fallbackMailbox.save();
      }
    }

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
