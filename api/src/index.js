const express = require('express');

module.exports = function createHandler() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
  });

  return app;
};

