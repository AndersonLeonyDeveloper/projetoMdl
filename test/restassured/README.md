# RestAssured (API)

Suíte de testes de API em Java/Maven (JUnit 5 + RestAssured). A API roda em `http://localhost:3001/api` e usa autenticação por token Bearer (`POST /auth/login`).

> **Status:** as oito classes estão escritas e **compilam** (conferido com `javac` e os jars do `~/.m2`), mas **ainda não foram executadas**: o ambiente em que foram criadas não tinha Maven, acesso ao Maven Central nem permissão para abrir a porta da API. O comportamento esperado foi conferido contra a API por outro meio (requisições injetadas no app), mas rode a suíte e corrija o que precisar.

## Como rodar
1. Subir a aplicação (`cd app && npm run dev`).
2. Popular o banco: `npm run db:populate` (cria os logins de teste, os 768 moradores, o histórico financeiro e os comprovantes de exemplo).
3. Rodar a suíte: `cd test/restassured && mvn test`. Para outra URL: `mvn test -DapiUrl=http://host:porta/api`.

Requisitos: Java 17+ e Maven 3.9+.

## Testes
| Classe | Cobre |
|---|---|
| `ComprovantesApiTest` | Upload e visualização de comprovantes: formatos, limite de 5 MB, validação de conteúdo, RBAC, path traversal e dados do seed (cenários de `sugestoes-de-testes.md`, seção 7.4) |
| `EdicaoDeLancamentosApiTest` | Editar despesas, outras receitas e taxas: validação, 404, RBAC, resumo refletindo a edição e comprovante mantido, trocado ou removido (seção 7.5) |
| `ConfiguracoesFinanceirasApiTest` | Multa, juros, vencimento e valor da taxa por ano: leitura, RBAC, validações e valores-limite (seção 7.5) |
| `GerarTaxasDoMesApiTest` | Geração das taxas do mês em lote: 192 taxas, idempotência, mês parcial, ano sem valor, RBAC e a prévia da geração (seção 7.5) |
| `RecalcularJurosApiTest` | Aviso de juros diferente do cálculo e recálculo de juros de taxa paga (seção 7.11) |
| `StatusDaTaxaApiTest` | Status derivado da taxa (adimplente, a vencer, em atraso) e seu efeito nos resumos (seção 7.10) |
| `DadosMoradoresApiTest` | Coluna Mensalidades de Dados dos Moradores: RBAC, formato por tipo de linha, taxa vencida × futura, ordem, pagar tira da lista, valor-limite do dia de vencimento, valor devido com juros até hoje e filtro por apartamento (seção 7.7) |
| `JurosNoPagamentoApiTest` | Fórmula de multa e juros, valores-limite do vencimento, arredondamento, ajuste manual e histórico preservado (seção 7.5) |

Os testes **criam lançamentos que a API não permite apagar** (inclusive 192 taxas por mês gerado, em anos futuros) e alteram um lançamento do seed (o teste do comprovante de exemplo compartilhado). Os que mexem na configuração financeira a restauram ao final. Para voltar ao estado inicial, rode `npm run db:populate` de novo.

Casos candidatos às próximas classes: itens marcados `API` em [`../../regras-de-negocio/sugestoes-de-testes.md`](../../regras-de-negocio/sugestoes-de-testes.md).
