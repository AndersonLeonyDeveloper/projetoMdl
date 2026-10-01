# Condomínio Morada da Lagoa — Web

Aplicação web para gestão de condomínio (moradores + financeiro), reconstruída a partir do
protótipo mobile original, com o objetivo de servir de terreno de prática para QA: testes
automatizados com Playwright + IA, pipelines de CI/CD, etc.

Ver `regras-de-negocio/` para as regras de negócio, a modelagem de dados e a lista de casos de
teste sugeridos.

## Stack

- **Frontend**: React + TypeScript + Vite + React Router + Ant Design (menus/submenus, tabelas com filtro e paginação)
- **Backend**: Node.js + Express
- **Banco de dados**: SQLite, via o módulo nativo [`node:sqlite`](https://nodejs.org/api/sqlite.html)
  (sem dependências binárias — evita problemas de compilação nativa em ambientes restritos)

> **Requisito**: Node.js **>= 22.5** (o projeto foi desenvolvido/testado em Node 26).

## Estrutura

```
server/   API Express + SQLite
client/   SPA React (Vite)
regras-de-negocio/   documentação de domínio, modelagem e casos de teste sugeridos
```

## Como rodar

```bash
# na raiz do repositório
npm install          # instala as dependências dos workspaces (server + client)

# configurar variáveis de ambiente
cp server/.env.example server/.env
cp client/.env.example client/.env.local

# criar o banco e popular com dados de exemplo
npm run db:migrate
npm run db:seed

# subir backend (porta 3001) e frontend (porta 5173) juntos
npm run dev
```

Acesse `http://localhost:5173`.

### Usuários de teste (senha padrão: `senha123`)

| E-mail | Perfil | Observação |
|---|---|---|
| admin@condominio.com | admin | acesso total |
| anderson@example.com | proprietario | vinculado a 2 apartamentos (Bl.08/203 e Bl.09/101) |
| maria@example.com | proprietario | Bl.08/101 |
| carlos.inquilino@example.com | inquilino | Bl.08/203 |

## Scripts úteis (raiz)

- `npm run dev` — sobe server + client em paralelo
- `npm run dev:server` / `npm run dev:client` — sobem individualmente
- `npm run db:migrate` — aplica o schema (`server/src/db/schema.sql`)
- `npm run db:seed` — popula o banco com dados cobrindo os cenários de `regras-de-negocio/sugestoes-de-testes.md`
- `npm run db:reset` — zera o banco, mantendo apenas o(s) usuário(s) admin (aborta se não houver admin)
- `npm run db:seed:moradores` — 1 proprietário + 3 inquilinos em cada um dos 192 apartamentos
- `npm run db:seed:financeiro` — histórico financeiro de jan/2020 a set/2026
- `npm run build` — build de produção do client

Detalhes e contexto dos dados de demonstração: [`regras-de-negocio/dados-de-demonstracao.md`](regras-de-negocio/dados-de-demonstracao.md)

Melhorias e ideias ainda não implementadas: [`regras-de-negocio/melhorias-e-ideias.md`](regras-de-negocio/melhorias-e-ideias.md)

IA generativa em testes (padrões de prompt e agentes possíveis): [`regras-de-negocio/ia-generativa-em-testes.md`](regras-de-negocio/ia-generativa-em-testes.md)
