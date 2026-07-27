import { MongoClient, type Collection } from 'mongodb';
import { config } from './config.js';
import type { Chunk } from './types.js';

let client: MongoClient | null = null;

export async function getCollection(): Promise<Collection<Chunk>> {
  if (!client) {
    client = new MongoClient(config.mongoUri);
    await client.connect();
  }
  return client.db(config.db).collection<Chunk>(config.collection);
}

export async function close(): Promise<void> {
  await client?.close();
  client = null;
}
