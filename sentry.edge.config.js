// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
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
