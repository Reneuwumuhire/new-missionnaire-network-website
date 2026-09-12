# Missionnaire Studio Google verification

Publish the website and Admin changes before submitting verification. These pages prepare branding review; they do not guarantee approval or implement Google sign-in for Admin.

## Branding fields

- App name: `Missionnaire Studio` (replace `Admin Studio app`).
- Homepage: `https://missionnaire.net/studio`
- Privacy policy: `https://missionnaire.net/privacy`
- Terms of service: `https://missionnaire.net/terms`
- Authorized domain: `missionnaire.net`
- Support email: confirm `misssionnaireapp@gmail.com` from the previous branding screenshot is monitored; the public pages use this address.
- Use the Missionnaire Network logo consistently.

## Ownership

In Google Search Console, verify ownership of the `missionnaire.net` domain using the DNS TXT record Google supplies. A Google account that is an owner or editor of the Cloud project must also be a verified owner of the domain. Alternatively follow Google's supported URL-prefix verification flow for the actual homepage host. A page or sitemap alone does not verify domain ownership. Do not invent a verification token.

## Actual authorization flow

Studio pairs with an existing Admin user who has recording management permission. Google OAuth then connects that user's YouTube channel. The implemented scope is `https://www.googleapis.com/auth/youtube.force-ssl`; it is used for channel identification, live stream/broadcast creation, thumbnails, binding, status, transitions and deletion of broadcasts. This is not basic Google identity sign-in (`openid email profile`).

The default web OAuth callback is `https://admin.missionnaire.net/api/youtube/oauth/callback`. If YOUTUBE_OAUTH_REDIRECT_URI overrides it, register that exact production value instead. Keep client secrets on the Admin server.

## Before resubmission

1. Confirm the privacy text matches actual operations, including hosting, retention, support and deletion handling. The current disconnect function deletes the stored channel authorization; Google revocation is a separate user action. Establish timely deletion handling and review YouTube retention requirements for retained broadcast records.
2. Publish and open all three URLs without signing in. Confirm the footer links and Admin approval notice work on production.
3. Verify domain ownership, save the branding fields above, then request branding re-verification.
4. Check Data Access / Verification Center for the YouTube scope review. If requested, supply a demonstration showing Admin approval, Google's consent screen, channel connection and the live operations requiring the scope. Branding approval alone does not approve sensitive scopes.

References:

- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
- https://developers.google.com/youtube/terms/developer-policies
