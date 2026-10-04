'use strict';
const express = require('express');
const { checkDatabase } = require('./config/database');
const app = express();
app.disable('x-powered-by');
app.get('/health', (_req,res) => res.json({ status: 'UP' }));
app.get('/ready', async (_req,res) => {
  try { await checkDatabase(); res.json({ status: 'UP' }); }
  catch (_error) { res.status(503).json({ status: 'DOWN' }); }
});
module.exports = app;
