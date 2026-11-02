// Starts a throwaway MongoDB in memory for trying the application without installing MongoDB.
// Everything is lost when it stops. Usage: node scripts/mongo-dev.mjs [port]
import { MongoMemoryServer } from 'mongodb-memory-server';

const port = Number(process.argv[2] || 27018);
const mongod = await MongoMemoryServer.create({ instance: { port, ip: '127.0.0.1' } });
console.log('Temporary MongoDB running: ' + mongod.getUri());
console.log('Set  MONGODB_URI=mongodb://127.0.0.1:' + port + '  in .env.local. Press Ctrl+C to stop (the data is then gone).');
const stop = async () => { await mongod.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
