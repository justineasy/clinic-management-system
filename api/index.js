// Vercel entry point: runs the same app as a serverless function in demo mode.
// Vercel has no permanent disk, so the database lives in /tmp and is re-seeded with sample data when an instance starts.
process.env.DB ||= '/tmp/clinichub-demo.db';
process.env.DEMO ||= '1';
const server = require('../server.js');
module.exports = (req, res) => server.emit('request', req, res);
