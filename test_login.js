/**
 * test_login.js  — end-to-end login smoke test
 *
 * Usage (server must be running on port 5000):
 *   node test_login.js <email> <password>
 */

require('dotenv').config();

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node test_login.js <email> <password>');
  process.exit(1);
}

const BASE = `http://localhost:${process.env.PORT || 5000}`;

async function main() {
  console.log(`\n🔐 Testing login for: ${email}`);
  console.log(`   POST ${BASE}/api/auth/login\n`);

  const res  = await fetch(`${BASE}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });

  const data = await res.json();
  console.log(`HTTP ${res.status}:`);
  console.log(JSON.stringify(data, null, 2));

  if (data.token) {
    console.log('\n✅ Login SUCCESS — testing /api/test-auth...');
    const authRes  = await fetch(`${BASE}/api/test-auth`, {
      headers: { Authorization: `Bearer ${data.token}` },
    });
    const authData = await authRes.json();
    console.log(JSON.stringify(authData, null, 2));
  } else {
    console.log('\n❌ Login FAILED');
  }
}

main().catch(e => { console.error('Test error:', e.message); process.exit(1); });
