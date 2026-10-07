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
app/                  sistema sob teste
  server/             API Express + SQLite
  client/             SPA React (Vite)
test/                 suítes de teste, uma pasta por ferramenta (ver test/README.md)
regras-de-negocio/    documentação de domínio, modelagem e casos de teste sugeridos
```

## Como rodar

```bash
cd app
npm install          # instala as dependências dos workspaces (server + client)

# configurar variáveis de ambiente
cp server/.env.example server/.env
cp client/.env.example client/.env.local

# criar o banco e popular com dados de exemplo
npm run db:migrate
npm run db:populate   # estrutura de demonstração (12 blocos × 16 apartamentos), admin, 768 moradores com logins de teste e o histórico financeiro

# subir backend (porta 3001) e frontend (porta 5173) juntos
npm run dev
```

Acesse `http://localhost:5173`.

**Primeiro acesso em um banco vazio** (sem `db:populate`): o servidor cria só o administrador padrão (`admin@condominio.com` / `senha123`). Ao entrar, o administrador cai no **assistente de configuração**, onde define como o condomínio é chamado (bloco, torre, rua…; apartamento, casa…), quantos agrupadores, andares e unidades existem e como são numeradas. Isso é feito uma vez; depois só é possível editar os nomes (Cadastro → Nomes do condomínio). Regras em `regras-de-negocio/regras-de-negocio.md`, seções 3.4 e 3.5.

### Usuários de teste (senha padrão: `senha123`)

| E-mail | Perfil | Observação |
|---|---|---|
| admin@condominio.com | admin | acesso total |
| anderson@example.com | proprietario | vinculado a 2 apartamentos (Bl.08/203 e Bl.09/101) |
| maria@example.com | proprietario | Bl.08/101 |
| carlos.inquilino@example.com | inquilino | Bl.08/203 |
| proprietario.bloco01@example.com … bloco03 | proprietario | apartamento 01 de cada bloco 01–03 |
| inquilino.bloco01@example.com … bloco03 | inquilino | apartamento 01 de cada bloco 01–03 |

## Telas do sistema

Detalhes das regras em [`regras-de-negocio/regras-de-negocio.md`](regras-de-negocio/regras-de-negocio.md). O ícone `?` no cabeçalho de todas as telas abre a ajuda guiada (tour da tela e guias por tarefa).

**Administrador**

| Menu | O que faz |
|---|---|
| Taxas do mês | O ciclo da taxa de um mês em uma tela: resumo, gerar as taxas, registrar pagamento, editar, cancelar e lançar uma taxa avulsa |
| Acordos | Renegocia taxas em atraso de um apartamento em parcelas (simulação, parcelas, quitação e cancelamento) |
| Cadastro → Moradores | Cadastra proprietários e inquilinos |
| Cadastro → Receitas / Despesas | Lança outras receitas e despesas, com comprovante, bloco (rateio) e "paga pelo fundo de reserva" |
| Cadastro → Configurações financeiras | Valor da taxa por ano, percentual do fundo, multa, juros, vencimento, saldo inicial do fundo e fator da taxa por apartamento |
| Visualizar → Financeiro | Resumo do mês (competência ou caixa), resumo por bloco, despesas e outras receitas |
| Visualizar → Evolução | Receitas, despesas e inadimplência ao longo dos anos |
| Visualizar → Dados dos Moradores | Contatos e situação das mensalidades de cada proprietário, e aviso de apartamentos sem proprietário |
| Visualizar → Taxa de Inadimplência | Consolidado de um ano, mês a mês |
| Visualizar → Fundo de reserva | Saldo, aportes, retiradas e obras pagas com o fundo |
| Visualizar → Histórico de alterações | Quem alterou o quê nos dados financeiros, com antes e depois |

**Proprietário e inquilino**

| Menu | O que faz |
|---|---|
| Meus Apartamentos | Apartamentos ligados à conta |
| Meus Dados | Atualização de nome, telefone e e-mail |
| Financeiro | Resumo do mês, resumo por bloco, despesas, outras receitas, comprovantes e a evolução do condomínio (sem inadimplência) |
| Fundo de reserva | Saldo do fundo e obras pagas com ele |

## Scripts úteis (rodar dentro de `app/`)

- `npm run dev` — sobe server + client em paralelo
- `npm run dev:server` / `npm run dev:client` — sobem individualmente
- `npm run db:migrate` — aplica o schema (`app/server/src/db/schema.sql`)
- `npm run db:populate` — monta o banco completo de demonstração: `db:reset` (cria a estrutura de demonstração se o condomínio ainda não estiver configurado) + `db:seed:moradores` (com os logins de teste) + `db:seed:financeiro`. Os seeds só funcionam na estrutura de demonstração; com outra estrutura eles param com uma mensagem (apague o arquivo do banco para voltar)
- `npm run db:vazio` — cria um banco **vazio** em `app/server/data/primeiro-acesso/` (só o admin, sem estrutura) para testar o primeiro acesso; nunca toca o banco de demonstração. Depois `npm run start:vazio` (API na porta 3002) e `npm run dev:vazio` (tela em `http://localhost:5174`). Roteiro em `test/roteiro-primeiro-acesso.md`
- `npm run admin -- <comando>` — contas de administrador pela linha de comando: `listar`, `criar <email> [senha]`, `senha <email> [nova]`, `desativar <email>`, `ativar <email>` (sem senha informada, gera uma aleatória e a mostra uma vez; vale o banco de `DATABASE_PATH`). Para o desenvolvedor; a tela do administrador é Cadastro → Administradores
- `npm run db:reset` — zera o banco, mantendo apenas o(s) usuário(s) admin (aborta se não houver admin)
- `npm run db:seed:moradores` — 1 proprietário + 3 inquilinos em cada um dos 192 apartamentos
- `npm run db:seed:financeiro` — histórico financeiro de jan/2020 a set/2026 (já gera os comprovantes de exemplo)
- `npm run db:comprovantes` — só regera os comprovantes fictícios (PDF/JPEG) em `app/server/data/comprovantes/`
- `npm run build` — build de produção do client

Detalhes e contexto dos dados de demonstração: [`regras-de-negocio/dados-de-demonstracao.md`](regras-de-negocio/dados-de-demonstracao.md)

Melhorias e ideias ainda não implementadas: [`regras-de-negocio/melhorias-e-ideias.md`](regras-de-negocio/melhorias-e-ideias.md)

IA generativa em testes (padrões de prompt e agentes possíveis): [`regras-de-negocio/ia-generativa-em-testes.md`](regras-de-negocio/ia-generativa-em-testes.md)
