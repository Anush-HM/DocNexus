// backend/scripts/createVectorIndex.js
// ─────────────────────────────────────────────
//  Run once after your first documents are processed:
//    node scripts/createVectorIndex.js
//
//  Creates the two Atlas Vector Search indexes this
//  project needs (on `chunks` and `qpchunks` collections).
//  Requires an Atlas cluster on M10+ OR a free/shared
//  cluster that supports Search (most do via Atlas Search).
// ─────────────────────────────────────────────

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(); // uses db name from the URI

  const chunkIndexDef = {
    name: process.env.VECTOR_INDEX_NAME || 'vector_index',
    type: 'vectorSearch',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: 1024, similarity: 'cosine' },
        { type: 'filter', path: 'projectId' },
      ],
    },
  };

  const qpIndexDef = {
    name: process.env.QP_VECTOR_INDEX_NAME || 'qp_vector_index',
    type: 'vectorSearch',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: 1024, similarity: 'cosine' },
        { type: 'filter', path: 'projectId' },
      ],
    },
  };

  try {
    await db.collection('chunks').createSearchIndex(chunkIndexDef);
    console.log(`Created vector index "${chunkIndexDef.name}" on chunks`);
  } catch (err) {
    console.error('Failed creating chunks index:', err.message);
  }

  try {
    await db.collection('qpchunks').createSearchIndex(qpIndexDef);
    console.log(`Created vector index "${qpIndexDef.name}" on qpchunks`);
  } catch (err) {
    console.error('Failed creating qpchunks index:', err.message);
  }

  console.log('Note: indexes take 1-2 minutes to build. Check status in Atlas UI -> Search.');
  await client.close();
}

main();