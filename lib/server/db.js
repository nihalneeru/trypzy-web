import { MongoClient } from 'mongodb'

// MongoDB connection
let client
let db

export async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME || 'trypzy')
  }
  return db
}

// Add this for testing - allows resetting the cached connection
export async function resetMongoConnection() {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}

