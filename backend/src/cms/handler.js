import { createApp } from './app.js';
import { dynamoStore } from './store.js';
import { s3Media } from './media.js';
let app;
export async function handler(event) {
  if (
    !process.env.CMS_TABLE_NAME ||
    !process.env.CMS_MEDIA_BUCKET ||
    !process.env.COGNITO_CLIENT_ID
  )
    return {
      statusCode: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: {
          code: 'CONFIGURATION',
          message: 'CMS configuration unavailable.',
        },
      }),
    };
  app ||= createApp({
    store: dynamoStore(process.env.CMS_TABLE_NAME),
    media: s3Media(process.env.CMS_MEDIA_BUCKET),
    clientId: process.env.COGNITO_CLIENT_ID,
  });
  let rawBody = '';
  if (event.body) {
    if (event.body.length > 140000)
      return {
        statusCode: 413,
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          error: { code: 'TOO_LARGE', message: 'Request exceeds limit.' },
        }),
      };
    rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
  }
  return app({
    method: event.requestContext?.http?.method || '',
    path: event.rawPath || '',
    query: event.queryStringParameters || {},
    rawBody,
    claims: event.requestContext?.authorizer?.jwt?.claims,
  });
}
