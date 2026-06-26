import express from 'express';
import cors from 'cors';

import { loadArmy, RelayError } from './relay.js';

const app = express();

app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/army', async (req, res) => {
  try {
    const army = await loadArmy(String(req.query.id ?? ''));
    res.json(army);
  } catch (error) {
    if (error instanceof RelayError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error('Unexpected error loading army:', error);
    res.status(502).json({ error: 'Could not load this army list.' });
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`OPR Card Generator API listening on port ${port}`);
});
