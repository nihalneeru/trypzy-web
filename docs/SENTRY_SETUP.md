# Sentry Error Tracking Setup

Sentry is configured for production error tracking. It's **disabled in development** to avoid noise.

## Quick Setup (5 minutes)

### 1. Create Sentry Account
1. Go to [sentry.io](https://sentry.io/)
2. Sign up for free account (includes 5,000 errors/month free)
3. Create a new project:
   - Platform: **Next.js**
   - Project name: `trypzy-web` (or your choice)

### 2. Get Your DSN
After creating the project, Sentry will show you a **DSN** (Data Source Name).

It looks like: `https://abc123@o123456.ingest.sentry.io/456789`

### 3. Add to Environment Variables

Add to your **production** `.env` (or Vercel environment variables):

```env
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn-here
SENTRY_DSN=https://your-dsn-here
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=trypzy-web
```

**For Vercel:**
- Go to your project settings → Environment Variables
- Add the 4 variables above
- Make sure they're set for **Production** environment

### 4. Optional: Auth Token (for source maps)

If you want source maps uploaded to Sentry (recommended):

1. Go to Sentry → Settings → Account → Auth Tokens
2. Create new token with `project:releases` and `org:read` scopes
3. Add to your build environment (Vercel):
   ```env
   SENTRY_AUTH_TOKEN=your-auth-token-here
   ```

## What Sentry Tracks

✅ **Automatically tracked:**
- Unhandled JavaScript errors
- Unhandled promise rejections
- API route errors
- Server-side errors
- Network errors

✅ **Additional features:**
- Session replay (10% sample rate)
- Performance monitoring (100% sample rate)
- Source maps for readable stack traces
- Ad-blocker bypass via `/monitoring` tunnel

## Verifying It Works

### After deploying to production:

1. Navigate to your production URL
2. Open browser console
3. Trigger an error: `throw new Error("Test Sentry")`
4. Check Sentry dashboard - error should appear within seconds

### Or trigger a test error via code:

Add this button temporarily to test:
```jsx
<button onClick={() => { throw new Error("Sentry test error") }}>
  Test Sentry
</button>
```

## Development Mode

Sentry is **disabled** when `NODE_ENV !== 'production'`:
- No errors sent during local development
- No DSN required in `.env.local`
- Zero impact on dev server performance

## Cost

**Free tier includes:**
- 5,000 errors/month
- 10,000 performance transactions/month
- 500 session replays/month

This is more than enough for beta testing and small-scale production.

## Privacy & Data

What Sentry captures:
- Error messages and stack traces
- User agent / browser info
- URL where error occurred
- Breadcrumbs (user actions leading to error)

What we've configured to **hide**:
- All text masked in session replays (`maskAllText: true`)
- All media blocked in replays (`blockAllMedia: true`)
- No PII (personally identifiable information) sent

## Disabling Sentry

To completely disable Sentry:

**Option 1:** Don't set the DSN environment variables (Sentry won't initialize)

**Option 2:** Remove from `next.config.js`:
```javascript
// Remove these lines:
const { withSentryConfig } = require("@sentry/nextjs");
module.exports = withSentryConfig(nextConfig, ...);

// Replace with:
module.exports = nextConfig;
```

**Option 3:** Uninstall:
```bash
npm uninstall @sentry/nextjs
```

## Troubleshooting

### Errors not appearing in Sentry?

1. Check environment variables are set in production
2. Verify DSN is correct
3. Make sure `NODE_ENV=production` (Sentry is disabled otherwise)
4. Check browser console for Sentry initialization errors

### Build failing?

If build fails due to missing Sentry config:
- Make sure `SENTRY_ORG` and `SENTRY_PROJECT` are set
- Or set `silent: true` in sentry config (already done)

### Want to test in development?

Change `sentry.client.config.js`:
```javascript
enabled: true, // Remove the production check
```

Don't commit this change!

## Documentation

- [Sentry Next.js Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Dashboard](https://sentry.io/)
