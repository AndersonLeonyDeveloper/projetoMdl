# Testes

Suítes de teste do sistema em [`../app`](../app), uma pasta por ferramenta. Cada suíte é independente e conhece a aplicação só pelas URLs: client em `http://localhost:5173` e API em `http://localhost:3001/api`.

| Pasta | Ferramenta | Tipo | Status |
|---|---|---|---|
| [`playwright/`](./playwright) | Playwright (TypeScript) | E2E (interface) | [ ] a criar |
| [`restassured/`](./restassured) | RestAssured (Java/Maven) | API | [~] 5 classes escritas e compiladas, ainda não executadas |

## Pré-requisitos para qualquer suíte
1. Subir a aplicação (`cd app && npm run dev`).
2. Popular o banco: `npm run db:reset && npm run db:seed:moradores && npm run db:seed:financeiro`. A suíte de comprovantes precisa dos usuários de teste, então use `npm run db:seed && npm run db:seed:financeiro`.
3. Usuário administrador: `admin@condominio.com` (senha padrão no README da raiz).

## De onde vêm os casos de teste
Os cenários estão em [`../regras-de-negocio/sugestoes-de-testes.md`](../regras-de-negocio/sugestoes-de-testes.md), com o tipo de teste indicado em cada item (`E2E`, `API`, `DB/Integridade`).

## Ajuda guiada nos testes E2E
O tour da ajuda abre sozinho na primeira visita a cada tela e cobre parte do conteúdo. Nos testes E2E, desligue a ajuda antes de interagir: grave `localStorage['ajuda:ativa:<id do usuário>'] = 'false'` (ou feche o tour). Os cenários da própria ajuda estão em `sugestoes-de-testes.md`, seção 7.6.
