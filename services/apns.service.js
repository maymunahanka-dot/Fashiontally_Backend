const http2 = require('http2');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

let cachedJwt = null;
let cachedJwtAt = 0;

function normalizeApnsKey(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/\\n/g, '\n').replace(/\r/g, '').trim();

  const begin = key.match(/-----BEGIN [A-Z0-9 ]+-----/);
  const end = key.match(/-----END [A-Z0-9 ]+-----/);
  if (begin && end && end.index > begin.index) {
    const header = begin[0];
    const footer = end[0];
    const body = key
      .slice(begin.index + header.length, end.index)
      .replace(/[^A-Za-z0-9+/=]/g, '');
    const lines = body.match(/.{1,64}/g) || [];
    if (!lines.length) return null;
    key = `${header}\n${lines.join('\n')}\n${footer}\n`;
  }

  try {
    const parsed = crypto.createPrivateKey(key);
    if (parsed.type !== 'private' || parsed.asymmetricKeyType !== 'ec') return null;
    return key;
  } catch {
    return null;
  }
}

function getPrivateKey() {
  if (process.env.APNS_PRIVATE_KEY) {
    return normalizeApnsKey(process.env.APNS_PRIVATE_KEY);
  }
  if (process.env.APNS_KEY_PATH && fs.existsSync(process.env.APNS_KEY_PATH)) {
    return normalizeApnsKey(fs.readFileSync(process.env.APNS_KEY_PATH, 'utf8'));
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
      const keyPresent = Boolean(process.env.APNS_PRIVATE_KEY || process.env.APNS_KEY_PATH);
      resolve({
        success: false,
        invalid: false,
        message: keyPresent && !getPrivateKey()
          ? 'APNS_PRIVATE_KEY is not a valid Apple .p8 key. Paste the file as one line and write each line break as \\n, including the BEGIN and END lines.'
          : 'APNs is not configured. Set APNS_KEY_ID, APNS_TEAM_ID, and APNS_PRIVATE_KEY or APNS_KEY_PATH.',
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

    let bearer;
    try {
      bearer = getJwt();
    } catch (err) {
      finish({ success: false, invalid: false, message: err.message });
      return;
    }

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${bearer}`,
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
