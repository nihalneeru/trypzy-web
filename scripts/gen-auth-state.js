const jwt = require('jsonwebtoken')
const { MongoClient } = require('mongodb')
const fs = require('fs')
const path = require('path')

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx).trim()
  let val = trimmed.slice(eqIdx + 1).trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  env[key] = val
}

async function main() {
  const client = new MongoClient(env.MONGO_URL || 'mongodb://localhost:27017')
  await client.connect()
  const db = client.db(env.DB_NAME || 'tripti')

  const user = await db.collection('users').findOne({}, { sort: { lastLoginAt: -1 } })
  if (!user) {
    console.error('No users found in database')
    process.exit(1)
  }

  console.log('Found user:', user.name, '(' + user.email + ')')

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, name: user.name },
    env.JWT_SECRET,
    { expiresIn: '24h' }
  )

  const storageState = {
    cookies: [],
    origins: [{
      origin: 'http://localhost:3000',
      localStorage: [
        { name: 'tripti_token', value: token },
        { name: 'tripti_user', value: JSON.stringify({ id: user._id.toString(), email: user.email, name: user.name }) }
      ]
    }]
  }

  fs.writeFileSync('/tmp/tripti-auth-state.json', JSON.stringify(storageState, null, 2))
  console.log('Auth state saved to /tmp/tripti-auth-state.json')

  await client.close()
}

main().catch(e => { console.error(e); process.exit(1) })
