# Melhorias e ideias de implementação

Backlog de melhorias identificadas durante o desenvolvimento. **Nenhum item abaixo está implementado**, a menos que esteja marcado como feito. A lista é uma sugestão, não um compromisso: cada item ainda precisa de decisão do produto.

Novas ideias devem ser adicionadas aqui assim que forem identificadas, com data e origem.

Marcadores: `[ ]` pendente, `[x]` implementado (com a data). Ao implementar um item, troque o marcador e anote a data.

Legenda de esforço: **P** (pequeno, até meio dia), **M** (médio, alguns dias), **G** (grande, exige decisão de regra de negócio ou mudança de modelo).

## 1. Telas e visualizações

### [x] 1.1 Tela "Evolução" (tendência multi-ano do financeiro) — esforço M
*Identificada em 01/10/2026, ao popular o histórico de 2020 a 2026. **Implementada em 01/10/2026** (`client/src/pages/admin/VisualizarEvolucao.tsx` e `GET /financeiro/resumo/evolucao`; gráficos com `recharts`).*

Hoje o app mostra um mês (Financeiro) ou um ano (Taxa de Inadimplência) por vez. A história do condomínio (pandemia, cobrança jurídica, obra de 2023) só aparece trocando o ano manualmente.

- **Onde:** Menu Admin → Visualizar → "Evolução", rota `/admin/visualizar/evolucao`, logo abaixo de "Financeiro".
- **Conteúdo:** filtro de ano inicial/final e alternância mensal/anual; cartões dos últimos 12 meses (receita, despesa, saldo, inadimplência, unidades com 3+ meses em aberto); gráfico de receitas × despesas; gráfico de inadimplência (%); tabela anual.
- **Backend:** novo `GET /financeiro/resumo/evolucao?ano_inicio&ano_fim`, restrito ao Admin, com uma consulta agregada por mês.
- **Cuidado com os dados:** a inadimplência "no vencimento" deve ser calculada por `data_pagamento` nula ou posterior ao dia 10. Se usar só `situacao = 'inadimplente'`, o pico da pandemia some, porque quase tudo foi pago depois.
- **Dependência nova:** `recharts`, adicionada ao cliente.

### [ ] 1.2 Financeiro com transparência para moradores — esforço P
Uma versão da tela de evolução, sem dados de inadimplência por apartamento, em "Minha Área → Financeiro". Serve como prestação de contas aos condôminos.

### [ ] 1.3 Tela para cadastrar blocos e apartamentos — esforço P
As rotas `POST /blocos` e `POST /apartamentos` existem, mas não há tela. Hoje a estrutura é criada automaticamente (12 blocos × 16 apartamentos). Uma tela seria útil se o condomínio mudar de estrutura.

## 2. Modelo de dados e regras

### [ ] 2.1 Fundo de reserva como entidade — esforço G
Hoje ele está embutido na taxa e só aparece no saldo anual. Modelá-lo (percentual da taxa, saldo acumulado, retiradas para obras) permitiria mostrar "a obra de 2023 foi paga pelo fundo de reserva" com números.

### [ ] 2.2 Saldo por regime de caixa — esforço M
`/financeiro/resumo/mensal` soma as taxas pelo **mês de referência**, e não pela data do pagamento. Um atraso pago depois conta como receita do mês original. Uma visão por data de pagamento (regime de caixa) daria outra leitura e poderia ser oferecida ao lado.

### [ ] 2.3 Rateio de despesas por bloco — esforço G
Já está em aberto em `regras-de-negocio.md`, seção 7. O saldo por bloco hoje usa adimplente − inadimplente, e não receita − despesa.

### [ ] 2.4 Taxa por fração ideal — esforço G
O modelo assume a mesma taxa para todos os apartamentos. Em muitos condomínios o valor varia com a metragem ou a fração ideal.

### [ ] 2.5 Status "a vencer" — esforço P
`situacao` só tem adimplente e inadimplente. Uma taxa do mês corrente ainda dentro do prazo aparece como inadimplente. Hoje o histórico termina em set/2026 para evitar isso.

### [ ] 2.6 Alerta de apartamento sem proprietário — esforço P
O sistema permite apartamento sem proprietário. Um relatório ou aviso de "unidades sem proprietário" ajudaria a manter o cadastro limpo.

### [ ] 2.7 Acordos e parcelamentos de dívida — esforço G
Hoje um acordo aparece como vários meses pagos na mesma data. Não há registro de acordo, parcelas ou cobrança judicial.

## 3. Dados de demonstração e ferramentas

### [ ] 3.1 Comando único `db:populate` — esforço P
Rodar `db:reset`, `db:seed:moradores` e `db:seed:financeiro` em sequência. Hoje são três comandos.

### [ ] 3.2 Unificar com o `db:seed` antigo — esforço P
O `db:seed` (7 moradores de exemplo) apaga e recria moradores e conflita com `db:seed:moradores`. Pode virar um modo "pequeno" do novo script, ou ser removido quando os testes automatizados não dependerem mais dele.

### [ ] 3.3 Logins para os moradores gerados — esforço P
Os 768 moradores não têm usuário de acesso. Criar logins para uma amostra permitiria demonstrar as telas de proprietário e inquilino com dados volumosos.

### [ ] 3.4 Comprovantes de exemplo — esforço M
As taxas, receitas e despesas geradas não têm comprovante. Arquivos fictícios permitiriam demonstrar o fluxo de visualização de comprovante.

### [ ] 3.5 Carregamento sob demanda das telas — esforço P
*Identificada em 01/10/2026, após adicionar o `recharts`.* O build do cliente avisa que o pacote passou de 500 kB. Carregar as telas por rota (`React.lazy`) evitaria baixar a biblioteca de gráficos fora da tela de Evolução.

### [ ] 3.6 Agente escriba de casos de teste (skill ou subagente) — esforço M
*Identificada em 01/10/2026.* Um agente que, dada uma funcionalidade nova ou alterada, adiciona cenários em `sugestoes-de-testes.md` no formato já usado. É o primeiro passo sugerido em `ia-generativa-em-testes.md`, que também lista os agentes seguintes (critérios de aceite, TCs combinatórios, testes automatizados, massa de dados, seleção de regressão).
