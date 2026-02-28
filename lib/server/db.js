import { MongoClient } from 'mongodb'

// MongoDB connection — serverless-safe singleton.
// Caches the client promise (not the resolved client) so concurrent
// invocations share the same connection handshake.
let clientPromise

function getClientPromise() {
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGO_URL, {
      // Fail fast on stale connections instead of hanging
      serverSelectionTimeoutMS: 5000,
    })
    clientPromise = client.connect()
  }
  return clientPromise
}

export async function connectToMongo() {
  try {
    const client = await getClientPromise()
    return client.db(process.env.DB_NAME || 'tripti')
  } catch (err) {
    // Connection failed (stale, network reset) — clear and retry once
    clientPromise = null
    const client = await getClientPromise()
    return client.db(process.env.DB_NAME || 'tripti')
  }
}

// Add this for testing - allows resetting the cached connection
export async function resetMongoConnection() {
  if (clientPromise) {
    try {
      const client = await clientPromise
      await client.close()
    } catch {}
    clientPromise = null
  }
}

