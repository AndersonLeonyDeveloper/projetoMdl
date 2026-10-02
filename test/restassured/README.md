# RestAssured (API)

Suíte de testes de API em Java/Maven (JUnit 5 + RestAssured). A API roda em `http://localhost:3001/api` e usa autenticação por token Bearer (`POST /auth/login`).

> **Status:** o primeiro conjunto de testes (comprovantes) está escrito, mas **ainda não foi compilado nem executado**: o ambiente em que foi criado não tinha Maven nem acesso ao repositório Maven Central. O comportamento esperado foi conferido contra a API por outro meio, mas rode a suíte e corrija o que precisar.

## Como rodar
1. Subir a aplicação (`cd app && npm run dev`).
2. Popular o banco: `npm run db:seed && npm run db:seed:financeiro` (cria os usuários de teste, o histórico financeiro e os comprovantes de exemplo).
3. Rodar a suíte: `cd test/restassured && mvn test`. Para outra URL: `mvn test -DapiUrl=http://host:porta/api`.

Requisitos: Java 17+ e Maven 3.9+.

## Testes
| Classe | Cobre |
|---|---|
| `ComprovantesApiTest` | Upload e visualização de comprovantes: formatos, limite de 5 MB, validação de conteúdo, RBAC, path traversal e dados do seed (cenários de `sugestoes-de-testes.md`, seção 7.4) |

Os testes **criam lançamentos que a API não permite apagar**. Para voltar ao estado inicial, rode de novo `db:seed` e `db:seed:financeiro`.

Casos candidatos às próximas classes: itens marcados `API` em [`../../regras-de-negocio/sugestoes-de-testes.md`](../../regras-de-negocio/sugestoes-de-testes.md).
