process.env.SOCIAL_STORAGE = 'netlify';
const { setEnvironmentContext } = require('@netlify/blobs');
const serverless = require('serverless-http');
const server = require('../../server');
const handle = serverless(server);

exports.handler = async (event, context) => {
  // The Lambda bridge omits the uncached URL required for strongly consistent reads.
  const blobs = JSON.parse(Buffer.from(event.blobs, 'base64').toString());
  setEnvironmentContext({
    deployID: event.headers['x-nf-deploy-id'],
    siteID: event.headers['x-nf-site-id'],
    edgeURL: blobs.url,
    uncachedEdgeURL: blobs.url_uncached,
    primaryRegion: blobs.primary_region,
    token: blobs.token
  });
  const suffix = event.path.replace(/^\/\.netlify\/functions\/api/, '');
  event.path = suffix.startsWith('/api/') ? suffix : '/api' + suffix;
  if (event.path === '/api/health') {
    await require('../../storage').readDb();
    return { statusCode: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify({ status: 'online', storage: 'connected' }) };
  }
  return handle(event, context);
};
