import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.routes.js';
import { condominioRouter } from './routes/condominio.routes.js';
import { cadastroRouter } from './routes/cadastro.routes.js';
import { financeiroRouter } from './routes/financeiro.routes.js';
import { acordosRouter } from './routes/acordos.routes.js';
import { administradoresRouter } from './routes/administradores.routes.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRouter);
  app.use('/api/condominio', condominioRouter);
  app.use('/api/administradores', administradoresRouter);
  app.use('/api', cadastroRouter);
  app.use('/api/financeiro/acordos', acordosRouter);
  app.use('/api/financeiro', financeiroRouter);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return app;
}
