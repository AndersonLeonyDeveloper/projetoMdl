# Melhorias e ideias de implementação

Backlog de melhorias identificadas durante o desenvolvimento. **Nenhum item abaixo está implementado**, a menos que esteja marcado como feito. A lista é uma sugestão, não um compromisso: cada item ainda precisa de decisão do produto.

Novas ideias devem ser adicionadas aqui assim que forem identificadas, com data e origem.

Marcadores: `[ ]` pendente, `[x]` implementado (com a data). Ao implementar um item, troque o marcador e anote a data.

Legenda de esforço: **P** (pequeno, até meio dia), **M** (médio, alguns dias), **G** (grande, exige decisão de regra de negócio ou mudança de modelo).

## 1. Telas e visualizações

### [x] 1.1 Tela "Evolução" (tendência multi-ano do financeiro) — esforço M
*Identificada em 01/10/2026, ao popular o histórico de 2020 a 2026. **Implementada em 01/10/2026** (`app/client/src/pages/admin/VisualizarEvolucao.tsx` e `GET /financeiro/resumo/evolucao`; gráficos com `recharts`).*

Hoje o app mostra um mês (Financeiro) ou um ano (Taxa de Inadimplência) por vez. A história do condomínio (pandemia, cobrança jurídica, obra de 2023) só aparece trocando o ano manualmente.

- **Onde:** Menu Admin → Visualizar → "Evolução", rota `/admin/visualizar/evolucao`, logo abaixo de "Financeiro".
- **Conteúdo:** filtro de ano inicial/final e alternância mensal/anual; cartões dos últimos 12 meses (receita, despesa, saldo, inadimplência, unidades com 3+ meses em aberto); gráfico de receitas × despesas; gráfico de inadimplência (%); tabela anual.
- **Backend:** novo `GET /financeiro/resumo/evolucao?ano_inicio&ano_fim`, restrito ao Admin, com uma consulta agregada por mês.
- **Cuidado com os dados:** a inadimplência "no vencimento" deve ser calculada por `data_pagamento` nula ou posterior ao dia 10. Se usar só `situacao = 'inadimplente'`, o pico da pandemia some, porque quase tudo foi pago depois.
- **Dependência nova:** `recharts`, adicionada ao cliente.

### [x] 1.2 Financeiro com transparência para moradores — esforço P
Uma versão da tela de evolução, sem dados de inadimplência por apartamento, em "Minha Área → Financeiro". Serve como prestação de contas aos condôminos. *Implementado em 02/10/2026:* Minha Área → Financeiro ganhou a seção "Evolução do condomínio" (a mesma tela de Evolução do admin em modo público, só com receitas, despesas e saldo) e o endpoint `GET /financeiro/resumo/evolucao-publica`, que não envia faturamento, atraso nem unidades. Regras na seção 4.5. A tela carrega a biblioteca de gráficos sob demanda.

### [x] 1.3 Tela para cadastrar blocos e apartamentos — esforço P
*Descartada em 02/10/2026:* a estrutura do condomínio é fixa e não serão adicionados blocos. A tela chegou a ser feita e foi removida no mesmo dia. Ficaram as rotas `POST /blocos` e `POST /apartamentos`, agora com validação do número (1 a 5 letras ou números, bloco de um dígito vira dois), da existência do bloco (404) e da duplicidade, sem tela. Regras na seção 3.4. A suíte de API não assume mais 192 apartamentos.

### [x] 1.4 Ajuda guiada (ícone de ajuda com tour e guias por tarefa) — esforço M
*Identificada em 02/10/2026, depois que o admin teve dificuldade para seguir o ciclo da taxa entre telas.* *Implementada em 02/10/2026* em `app/client/src/ajuda/`: ícone `?` sempre visível no cabeçalho, painel com "Nesta tela" (botão "Iniciar tour da tela", que destaca os elementos) e "Como fazer…" (guias por tarefa com "Ir para a tela"), com conteúdo separado para admin e moradores. A primeira versão tinha um switch para desligar a ajuda e um tour que abria sozinho na primeira visita; ambos foram removidos no mesmo dia, por não serem necessários. Regras na seção 8 de `regras-de-negocio.md`.

### [x] 1.5 Ajuda guiada: manter o conteúdo em dia — esforço P
*Identificada em 02/10/2026.* *Implementada em 02/10/2026:* `npm run verificar:ajuda` (`app/client/scripts/verificar-ajuda.mjs`) lê `ajuda/conteudo.ts` e as telas e falha se algum alvo de tour não existir como `data-testid`, ou se uma rota de tour ou de guia não existir em `App.tsx` (avisa quando a rota de um guia não tem tour). Rode depois de mudar uma tela ou o conteúdo da ajuda. É uma checagem estática: não abre a aplicação, então não pega um elemento que existe no código mas não aparece em certas condições (isso fica com o cenário E2E de "todos os alvos existem"). O resto das ideias deste item virou o item 1.7.

### [ ] 1.7 Ajuda guiada: tour contínuo e descoberta — esforço M
*Identificada em 02/10/2026.* Guias que, em vez de só listar os cliques, conduzam o usuário entre telas (tour contínuo); botão "esta ajuda foi útil?" para saber quais guias confundem; destaque sutil no ícone `?` para quem nunca o usou, se a descoberta virar problema (hoje o tour só abre quando o usuário clica em "Iniciar tour da tela"). Rodar `verificar:ajuda` também no pipeline de CI quando ele existir (item 3.7).

## 2. Modelo de dados e regras

### [ ] 2.1 Fundo de reserva como entidade — esforço G
Hoje ele está embutido na taxa e só aparece no saldo anual. Modelá-lo (percentual da taxa, saldo acumulado, retiradas para obras) permitiria mostrar "a obra de 2023 foi paga pelo fundo de reserva" com números.

### [ ] 2.2 Saldo por regime de caixa — esforço M
`/financeiro/resumo/mensal` soma as taxas pelo **mês de referência**, e não pela data do pagamento. Um atraso pago depois conta como receita do mês original. Uma visão por data de pagamento (regime de caixa) daria outra leitura e poderia ser oferecida ao lado.

### [ ] 2.3 Rateio de despesas por bloco — esforço G
Já está em aberto em `regras-de-negocio.md`, seção 7. O saldo por bloco hoje usa adimplente − inadimplente, e não receita − despesa.

### [ ] 2.4 Taxa por fração ideal — esforço G
O modelo assume a mesma taxa para todos os apartamentos. Em muitos condomínios o valor varia com a metragem ou a fração ideal.

### [x] 2.5 Status "a vencer" — esforço P
`situacao` só tem adimplente e inadimplente. Uma taxa do mês corrente ainda dentro do prazo aparece como inadimplente. Hoje o histórico termina em set/2026 para evitar isso. *Implementado em 02/10/2026:* `GET /financeiro/taxas` devolve `status` (adimplente, a vencer ou em atraso, derivado do vencimento configurado; a situação gravada não muda). A tabela de taxas mostra as etiquetas e filtra por status, e os resumos por bloco, de Inadimplência e da Evolução passaram a tratar "inadimplente" como só em atraso, com "a vencer" à parte. Regras nas seções 4.1 e 4.4 de `regras-de-negocio.md`.

### [x] 2.6 Alerta de apartamento sem proprietário — esforço P
O sistema permite apartamento sem proprietário. Um relatório ou aviso de "unidades sem proprietário" ajudaria a manter o cadastro limpo. *Implementado em 02/10/2026:* aviso no topo de Dados dos Moradores ("N apartamento(s) sem proprietário", vazios e só com inquilinos, e quantos têm atraso), botão "Mostrar apenas esses" e etiqueta "Sem proprietário" na coluna Mensalidades, que também mostra o atraso do apartamento nessas linhas. `GET /dados-moradores` ganhou `sem_proprietario`. Regras na seção 4.9.

### [ ] 2.7 Acordos e parcelamentos de dívida — esforço G
Hoje um acordo aparece como vários meses pagos na mesma data. Não há registro de acordo, parcelas ou cobrança judicial.

### [x] 2.8 Edição de lançamentos (despesas, receitas e taxas) — esforço M
*Identificada em 02/10/2026, ao notar que um valor digitado errado não podia ser corrigido.* Hoje só existe criação: a API tem `POST` para despesas e outras receitas, e a taxa só tem o registro de pagamento (`PUT /taxas/:id/pagamento`, sem tela). A edição inclui trocar ou remover o comprovante (apagando o arquivo antigo do disco) e uma tela para registrar o pagamento da taxa. Regras em `regras-de-negocio.md`, seção 4.8. *Implementado em 02/10/2026:* `PUT /financeiro/despesas/:id`, `/outras-receitas/:id` e `/taxas/:id`, modal "Editar" nas listas (despesas e receitas nas telas dos dois perfis, só o admin vê o botão) e "Registrar pagamento / Editar" na tabela de taxas.

### [x] 2.9 Configurações financeiras (valor da taxa por ano, multa, juros e vencimento) — esforço M
*Identificada em 02/10/2026.* Tela do admin para definir o valor da taxa por ano, a multa (padrão 2%), o juros ao mês (padrão 1%) e o dia de vencimento (padrão 10). O valor da taxa pré-preenche o lançamento. Regras na seção 4.6. Prepara o item 2.4 (taxa por fração ideal). *Implementado em 02/10/2026:* tela Cadastro → Configurações financeiras (`GET`/`PUT /financeiro/configuracoes`), com os valores de 2020 a 2026 vindos do seed.

### [x] 2.10 Gerar taxas do mês em lote — esforço M
*Identificada em 02/10/2026.* Hoje o admin lança uma taxa por apartamento (192 por mês). Um botão "Gerar taxas do mês" cria todas com o valor configurado, ignorando as que já existem. Depende do item 2.9. Regras na seção 4.7. *Implementado em 02/10/2026:* `POST /financeiro/taxas/gerar-mes` e o bloco "Gerar taxas do mês" na tela Cadastro → Taxas de condomínio (com valor do ano editável, confirmação e link para as taxas do mês) e `GET /financeiro/taxas/gerar-mes/previa`.

### [x] 2.11 Juros e multa calculados no pagamento — esforço M
*Identificada em 02/10/2026.* Hoje o registro de pagamento não calcula nem grava juros (só o seed preenche). O servidor passa a calcular multa mais juros simples pro rata a partir da data de pagamento, com prévia na tela e ajuste manual. Depende do item 2.9. Fecha a ambiguidade de juros da seção 7 de `regras-de-negocio.md`. Fórmula na seção 4.1.1. *Implementado em 02/10/2026:* `calcularJuros` em `app/server/src/utils/juros.js`, usado no registro de pagamento e na edição, e prévia em `GET /financeiro/taxas/:id/calculo-juros`.

### [ ] 2.12 Excluir lançamentos — esforço M
*Identificada em 02/10/2026, deixada de fora do item 2.8 de propósito.* Excluir altera saldos e histórico. Precisa de decisão sobre confirmação, exclusão lógica (marcar como cancelado) ou física, e o que fazer com o comprovante.

### [x] 2.13 Histórico de alterações (auditoria) — esforço G
*Identificada em 02/10/2026.* A edição do item 2.8 sobrescreve o valor anterior sem rastro. Para dado financeiro, convém registrar quem alterou, quando, e o valor antes e depois, com uma tela de consulta. *Implementado em 02/10/2026:* tabela `auditoria` gravada pelas rotas que alteram taxas, despesas, outras receitas e configurações (criar, editar, pagar, recalcular juros, gerar mês), com o antes e o depois, `GET /financeiro/auditoria` (filtros e paginação) e a tela Visualizar → Histórico de alterações. Regras na seção 4.10. Fica de fora a gravação na mesma transação da alteração e o registro de alterações de moradores e de usuários.

### [x] 2.14 Recalcular juros de taxa já paga — esforço P
*Identificada em 02/10/2026.* Corrigir o valor ou a data de pagamento de uma taxa não recalcula o juros já gravado (a tela só mostra o novo cálculo). Avaliar um botão "Recalcular juros" e um aviso quando o juros gravado diverge do calculado. *Implementado em 02/10/2026:* `GET /financeiro/taxas` devolve `juros_calculado` e `juros_diverge`; a tabela de taxas mostra a etiqueta "Difere do cálculo" (com confirmação para regravar) e o modal de edição tem o botão "Recalcular juros"; `POST /financeiro/taxas/:id/recalcular-juros` regrava o juros de uma taxa paga. Regras na seção 4.1.1. Fica de fora um recálculo em massa.

### [ ] 2.15 Tela única "Taxas do mês" — esforço M
*Identificada em 02/10/2026, ao revisar a usabilidade do ciclo da taxa.* Hoje o ciclo passa por três telas: gerar (Cadastro → Taxas de condomínio), registrar pagamento (Visualizar → Financeiro) e configurar valor, multa e juros (Cadastro → Configurações financeiras). O link "Ver taxas do mês" e o valor editável na geração reduziram o problema. Uma tela única reuniria, para o mês escolhido, o resumo (geradas, pagas, em aberto), o botão gerar e a tabela com "Registrar pagamento", movendo a tabela de taxas de Visualizar → Financeiro.

## 3. Dados de demonstração e ferramentas

### [x] 3.1 Comando único `db:populate` — esforço P
Rodar `db:reset`, `db:seed:moradores` e `db:seed:financeiro` em sequência. Hoje são três comandos. *Implementado em 02/10/2026:* `npm run db:populate` (`app/server/src/db/populate.js`) roda `db:reset`, `db:seed:moradores` e `db:seed:financeiro` em sequência, parando no primeiro erro, e funciona também em banco novo (o reset cria o administrador se faltar).

### [x] 3.2 Unificar com o `db:seed` antigo — esforço P
O `db:seed` (7 moradores de exemplo) apaga e recria moradores e conflita com `db:seed:moradores`. Pode virar um modo "pequeno" do novo script, ou ser removido quando os testes automatizados não dependerem mais dele. *Implementado em 02/10/2026:* o `db:seed` foi removido. Os logins de teste e os cenários de borda (apartamento vazio, só inquilinos, histórico de inquilino) passaram para o `db:seed:moradores`, e a suíte de API roda com `db:populate`, sem apagar os 768 moradores.

### [x] 3.3 Logins para os moradores gerados — esforço P
Os 768 moradores não têm usuário de acesso. Criar logins para uma amostra permitiria demonstrar as telas de proprietário e inquilino com dados volumosos. *Implementado em 02/10/2026:* o `db:seed:moradores` cria logins (`senha123`) para `anderson@`, `maria@` e `carlos.inquilino@example.com` e para o proprietário e o inquilino do apartamento 01 dos blocos 01 a 03, ligados a moradores gerados.

### [x] 3.4 Comprovantes de exemplo — esforço M
*Implementado em 02/10/2026.* O script `db:comprovantes` gera 12 arquivos fictícios (PDF e JPEG, 2 modelos por tipo) em `app/server/data/comprovantes/`, e o `db:seed:financeiro` já o chama. Parte dos lançamentos aponta para eles (60% das taxas pagas, 80% das receitas, 90% das despesas). Os três formulários de cadastro têm o campo opcional "Comprovante" (PDF, JPEG ou PNG, até 5 MB), e os dois perfis veem o arquivo pelo link "Ver comprovante" (taxas na tela do admin, receitas e despesas nas telas de Financeiro dos dois perfis).

### [x] 3.5 Carregamento sob demanda das telas — esforço P
*Identificada em 01/10/2026, após adicionar o `recharts`.* O build do cliente avisa que o pacote passou de 500 kB. Carregar as telas por rota (`React.lazy`) evitaria baixar a biblioteca de gráficos fora da tela de Evolução. *Implementado em 02/10/2026:* as telas de admin e de morador carregam com `React.lazy` (`App.tsx`), com um indicador de carregamento no layout. O pacote de entrada caiu de 1.776 kB para 257 kB e a Evolução, com o `recharts`, virou um arquivo próprio de 380 kB. **O aviso de 500 kB do build continua**, por causa de um arquivo compartilhado do antd (cerca de 580 kB) que as telas dividem; reduzi-lo exigiria separar o antd por componente ou aumentar o limite do aviso.

### [ ] 3.6 Agente escriba de casos de teste (skill ou subagente) — esforço M
*Identificada em 01/10/2026.* Um agente que, dada uma funcionalidade nova ou alterada, adiciona cenários em `sugestoes-de-testes.md` no formato já usado. É o primeiro passo sugerido em `ia-generativa-em-testes.md`, que também lista os agentes seguintes (critérios de aceite, TCs combinatórios, testes automatizados, massa de dados, seleção de regressão).

### [ ] 3.7 Pipeline de CI (GitHub Actions) — esforço M
*Identificada em 01/10/2026, ao organizar o repositório para entrevistas.* Subir a aplicação, popular o banco (`db:reset` + `db:seed:moradores` + `db:seed:financeiro`) e rodar as suítes de `test/`. O workflow fica em `.github/workflows/`, na raiz.

### [ ] 3.8 docker-compose para subir a aplicação — esforço M
*Identificada em 01/10/2026.* Um comando para subir client e server em ambiente isolado, útil para quem vai avaliar o repositório e para o CI.

### [ ] 3.9 Especificação OpenAPI da API — esforço M
*Identificada em 01/10/2026.* Documenta as rotas e serve de base para testes de contrato (RestAssured).

### [ ] 3.10 Testes de performance (k6) — esforço M
*Identificada em 01/10/2026.* Usar o volume de 192 apartamentos e 768 moradores para medir listagens e o endpoint de evolução.

### [ ] 3.11 Esteira de testes com Jira (repositório `qa-orchestrator`) — esforço G
*Identificada em 01/10/2026.* Agentes que leem as regras no Jira e geram ACs, TCs, testes automatizados e bugs rastreáveis, com um teste de regressão por bug. Mora no repositório vizinho `qa-orchestrator` (desenho em `docs/desenho-da-esteira.md`), e este projeto é o primeiro projeto-alvo. Fases: [ ] 0 regras em arquivo, [ ] 1 Jira somente leitura, [ ] 2 escrita controlada, [ ] 3 bugs com rastreabilidade completa.
