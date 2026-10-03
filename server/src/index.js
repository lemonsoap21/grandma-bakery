import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { router } from './routes.js';
import { startScheduler } from './scheduler.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/agent-screenshots', express.static(config.agentScreenshotDir));
app.use('/api', router);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(config.port, () => {
  console.log(`Daniel API listening on http://localhost:${config.port}`);
  startScheduler();
});
