const http2 = require('http2');
const fs = require('fs');
const jwt = require('jsonwebtoken');

let cachedJwt = null;
let cachedJwtAt = 0;

function getPrivateKey() {
  if (process.env.APNS_PRIVATE_KEY) {
    return process.env.APNS_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  if (process.env.APNS_KEY_PATH && fs.existsSync(process.env.APNS_KEY_PATH)) {
    return fs.readFileSync(process.env.APNS_KEY_PATH, 'utf8');
  }
  return null;
}

function isConfigured() {
  return Boolean(getPrivateKey() && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

function getJwt() {
  const key = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwtAt < 50 * 60) return cachedJwt;
  cachedJwt = jwt.sign(
    { iss: process.env.APNS_TEAM_ID, iat: now },
    key,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: process.env.APNS_KEY_ID } }
  );
  cachedJwtAt = now;
  return cachedJwt;
}

function sendApns(deviceToken, title, body, data = {}) {
  return new Promise((resolve) => {
    if (!isConfigured()) {
      resolve({
        success: false,
        invalid: false,
        message: 'APNs is not configured. Set APNS_KEY_ID, APNS_TEAM_ID, and APNS_PRIVATE_KEY or APNS_KEY_PATH.',
      });
      return;
    }

    const production = process.env.APNS_PRODUCTION === 'true';
    const host = production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
    const topic = process.env.APNS_BUNDLE_ID || 'com.fashion.fashiontally';
    const client = http2.connect(`https://${host}`);

    const finish = (result) => {
      client.close();
      resolve(result);
    };

    client.on('error', (err) => {
      finish({ success: false, invalid: false, message: err.message });
    });

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${getJwt()}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    });

    let status = 0;
    let responseBody = '';
    req.setEncoding('utf8');
    req.on('response', (headers) => {
      status = Number(headers[':status'] || 0);
    });
    req.on('data', (chunk) => {
      responseBody += chunk;
    });
    req.on('end', () => {
      if (status === 200) {
        finish({ success: true, invalid: false });
        return;
      }
      let reason = responseBody;
      try {
        reason = JSON.parse(responseBody).reason || responseBody;
      } catch {
        // Keep the raw body.
      }
      const invalid = reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic';
      finish({ success: false, invalid, message: reason || `APNs status ${status}` });
    });
    req.on('error', (err) => {
      finish({ success: false, invalid: false, message: err.message });
    });
    req.end(JSON.stringify({
      aps: { alert: { title, body }, sound: 'default' },
      ...data,
    }));
  });
}

module.exports = { sendApns, isConfigured };
