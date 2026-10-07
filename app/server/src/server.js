import 'dotenv/config';
import { createApp } from './app.js';
import { garantirAdmin, runMigrations } from './db/index.js';

runMigrations();
// Banco novo: o primeiro acesso precisa de um administrador para abrir o assistente de configuração.
if (garantirAdmin()) console.log('Administrador padrão criado (admin@condominio.com / senha123). Troque a senha no primeiro acesso.');

const app = createApp();
const port = process.env.PORT ?? 3001;

app.listen(port, () => {
  console.log(`API rodando em http://localhost:${port}`);
});
