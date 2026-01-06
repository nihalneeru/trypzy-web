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

