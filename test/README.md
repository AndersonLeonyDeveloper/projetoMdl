# Testes

Suítes de teste do sistema em [`../app`](../app), uma pasta por ferramenta. Cada suíte é independente e conhece a aplicação só pelas URLs: client em `http://localhost:5173` e API em `http://localhost:3001/api`.

| Pasta | Ferramenta | Tipo | Status |
|---|---|---|---|
| [`playwright/`](./playwright) | Playwright (TypeScript) | E2E (interface) | [ ] a criar |
| [`restassured/`](./restassured) | RestAssured (Java/Maven) | API | [~] 20 classes escritas e compiladas, ainda não executadas |

## Pré-requisitos para qualquer suíte
1. Subir a aplicação (`cd app && npm run dev`).
2. Popular o banco: `npm run db:populate` (admin, 768 moradores com os logins de teste e o histórico financeiro). Pode ser repetido a qualquer momento para voltar ao estado inicial.
3. Usuário administrador: `admin@condominio.com` (senha padrão no README da raiz).

## Primeiro acesso do administrador
O assistente de configuração só roda uma vez por banco, então é testado num **segundo banco vazio**, com uma segunda instância da API (porta 3002): `npm run db:vazio` + `npm run start:vazio`. Roteiro manual e testes de API em [`roteiro-primeiro-acesso.md`](./roteiro-primeiro-acesso.md).

## De onde vêm os casos de teste
Os cenários estão em [`../regras-de-negocio/sugestoes-de-testes.md`](../regras-de-negocio/sugestoes-de-testes.md), com o tipo de teste indicado em cada item (`E2E`, `API`, `DB/Integridade`).
