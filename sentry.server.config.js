// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://25e005930a529c75734fe0bb97af7840@o4510787502342144.ingest.us.sentry.io/4510787506405376",

  // Sample 10% of traces in production to control costs
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Disable sending user PII (IP, cookies, headers) to third-party service
  sendDefaultPii: false,
});
