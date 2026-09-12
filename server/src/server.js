import 'dotenv/config';
import { createApp } from './app.js';
import { runMigrations } from './db/index.js';

runMigrations();

const app = createApp();
const port = process.env.PORT ?? 3001;

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
