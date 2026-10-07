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
*Descartada em 02/10/2026:* a estrutura do condomínio era fixa e não seriam adicionados blocos. A tela chegou a ser feita e foi removida no mesmo dia. *Em 07/10/2026* a estrutura deixou de ser fixa (item 2.22), mas a tela continua descartada: a estrutura nasce do assistente de primeiro acesso e só cresce pela API. Ficaram as rotas `POST /blocos` e `POST /apartamentos`, agora com validação do número (1 a 5 letras ou números, bloco de um dígito vira dois), da existência do bloco (404) e da duplicidade, sem tela. Regras na seção 3.4. A suíte de API não assume mais 192 apartamentos.

### [x] 1.4 Ajuda guiada (ícone de ajuda com tour e guias por tarefa) — esforço M
*Identificada em 02/10/2026, depois que o admin teve dificuldade para seguir o ciclo da taxa entre telas.* *Implementada em 02/10/2026* em `app/client/src/ajuda/`: ícone `?` sempre visível no cabeçalho, painel com "Nesta tela" (botão "Iniciar tour da tela", que destaca os elementos) e "Como fazer…" (guias por tarefa com "Ir para a tela"), com conteúdo separado para admin e moradores. A primeira versão tinha um switch para desligar a ajuda e um tour que abria sozinho na primeira visita; ambos foram removidos no mesmo dia, por não serem necessários. Regras na seção 8 de `regras-de-negocio.md`.

### [x] 1.5 Ajuda guiada: manter o conteúdo em dia — esforço P
*Identificada em 02/10/2026.* *Implementada em 02/10/2026:* `npm run verificar:ajuda` (`app/client/scripts/verificar-ajuda.mjs`) lê `ajuda/conteudo.ts` e as telas e falha se algum alvo de tour não existir como `data-testid`, ou se uma rota de tour ou de guia não existir em `App.tsx` (avisa quando a rota de um guia não tem tour). Rode depois de mudar uma tela ou o conteúdo da ajuda. É uma checagem estática: não abre a aplicação, então não pega um elemento que existe no código mas não aparece em certas condições (isso fica com o cenário E2E de "todos os alvos existem"). O resto das ideias deste item virou o item 1.7.

### [ ] 1.7 Ajuda guiada: tour contínuo e descoberta — esforço M
*Identificada em 02/10/2026.* Guias que, em vez de só listar os cliques, conduzam o usuário entre telas (tour contínuo); botão "esta ajuda foi útil?" para saber quais guias confundem; destaque sutil no ícone `?` para quem nunca o usou, se a descoberta virar problema (hoje o tour só abre quando o usuário clica em "Iniciar tour da tela"). Rodar `verificar:ajuda` também no pipeline de CI quando ele existir (item 3.7).

### [ ] 1.8 Exportar a lista de devedores (CSV) — esforço P
*Identificada em 02/10/2026 (ideia derivada do item 1.6).* Em Dados dos Moradores, um botão para baixar em CSV os proprietários com mensalidades em atraso: apartamento, contatos, meses em atraso, valor devido hoje (com juros) e taxas em acordo. Serve à cobrança fora do sistema.

## 2. Modelo de dados e regras

### [x] 2.1 Fundo de reserva — esforço G
Hoje ele está embutido na taxa e só aparece no saldo anual. Modelá-lo (percentual da taxa, saldo acumulado, retiradas para obras) permitiria mostrar "a obra de 2023 foi paga pelo fundo de reserva" com números. *Implementado em 02/10/2026, sem uma tabela própria de movimentos:* um percentual da taxa paga (por ano, padrão 10%, sobre o valor sem juros, no mês do pagamento) vira aporte, e as despesas marcadas como pagas pelo fundo viram retiradas; saldo = saldo inicial + aportes − retiradas. Há configuração do percentual por ano e do saldo inicial, a marca "Paga pelo fundo de reserva" nas despesas, `GET /financeiro/fundo-reserva` e a tela Fundo de reserva (admin e morador). O seed marca as obras (CFTV, pintura, bombas, impermeabilização e quadra) e define saldo inicial de R$ 50.000. Regras na seção 4.13. Ficam de fora aportes e retiradas avulsos, alerta de saldo baixo e o aporte pelo percentual do ano de pagamento.

### [x] 2.2 Saldo por regime de caixa — esforço M
`/financeiro/resumo/mensal` soma as taxas pelo **mês de referência**, e não pela data do pagamento. Um atraso pago depois conta como receita do mês original. Uma visão por data de pagamento (regime de caixa) daria outra leitura e poderia ser oferecida ao lado. *Implementado em 02/10/2026:* `GET /financeiro/resumo/mensal?regime=caixa` (por data de pagamento) ao lado da competência (padrão) e o seletor "Competência | Caixa" no resumo do mês de Visualizar → Financeiro e de Minha Área → Financeiro. Regras na seção 4.4. Ficam de fora o regime de caixa na Evolução e no resumo por bloco.

### [x] 2.3 Rateio de despesas por bloco — esforço G
Já está em aberto em `regras-de-negocio.md`, seção 7. O saldo por bloco hoje usa adimplente − inadimplente, e não receita − despesa. *Implementado em 02/10/2026:* a despesa pode ser geral (dividida por igual entre os blocos) ou de um bloco; as outras receitas também se dividem por igual. O resumo por bloco passou a ter `receitas`, `despesas` e `saldo = receitas − despesas` (a soma dos saldos bate com o saldo mensal), substituindo a conta antiga de adimplente menos inadimplente. O seed ganhou 3 despesas de bloco (bombas do bloco 05 e impermeabilização dos blocos 03 e 07), sem mudar os totais. Regras na seção 4.4. Fica de fora o rateio proporcional às unidades.

### [x] 2.4 Taxa por fração ideal (fator por apartamento) — esforço G
O modelo assume a mesma taxa para todos os apartamentos. Em muitos condomínios o valor varia com a metragem ou a fração ideal. *Implementado em 02/10/2026 como um fator por apartamento:* cada apartamento tem um fator (padrão 1,00, de 0,1 a 5) que multiplica o valor-base do ano na geração das taxas do mês e no valor sugerido do lançamento individual. Há tabela de edição por bloco em Configurações financeiras, "Aplicar a todo o bloco", auditoria e `PUT /apartamentos/:id/fator-taxa`. Não é a fração ideal em % do total do condomínio (essa opção foi descartada por mudar o significado do valor do ano). Regras na seção 4.6. Fica de fora recalcular taxas já geradas quando o fator muda.

### [x] 2.5 Status "a vencer" — esforço P
`situacao` só tem adimplente e inadimplente. Uma taxa do mês corrente ainda dentro do prazo aparece como inadimplente. Hoje o histórico termina em set/2026 para evitar isso. *Implementado em 02/10/2026:* `GET /financeiro/taxas` devolve `status` (adimplente, a vencer ou em atraso, derivado do vencimento configurado; a situação gravada não muda). A tabela de taxas mostra as etiquetas e filtra por status, e os resumos por bloco, de Inadimplência e da Evolução passaram a tratar "inadimplente" como só em atraso, com "a vencer" à parte. Regras nas seções 4.1 e 4.4 de `regras-de-negocio.md`.

### [x] 2.6 Alerta de apartamento sem proprietário — esforço P
O sistema permite apartamento sem proprietário. Um relatório ou aviso de "unidades sem proprietário" ajudaria a manter o cadastro limpo. *Implementado em 02/10/2026:* aviso no topo de Dados dos Moradores ("N apartamento(s) sem proprietário", vazios e só com inquilinos, e quantos têm atraso), botão "Mostrar apenas esses" e etiqueta "Sem proprietário" na coluna Mensalidades, que também mostra o atraso do apartamento nessas linhas. `GET /dados-moradores` ganhou `sem_proprietario`. Regras na seção 4.9.

### [x] 2.7 Acordos e parcelamentos de dívida — esforço G
Hoje um acordo aparece como vários meses pagos na mesma data. Não há registro de acordo, parcelas ou cobrança judicial. *Implementado em 02/10/2026:* tela **Acordos** e `/financeiro/acordos`: o admin escolhe taxas em atraso de um apartamento, o número de parcelas (até 60), o primeiro vencimento, a entrada e um desconto opcional (simulação antes de criar). Enquanto o acordo vale, as taxas ficam "Em acordo" e saem do atraso; cada parcela paga entra como receita no mês do pagamento; parcela vencida há mais de 5 dias torna o acordo descumprido e as taxas voltam ao atraso. Regras na seção 4.14. Ficam de fora: abater o que já foi pago quando o acordo é descumprido ou cancelado, remover pagamento de parcela, alterar um acordo existente e cobrar juros sobre parcela atrasada.

### [x] 2.8 Edição de lançamentos (despesas, receitas e taxas) — esforço M
*Identificada em 02/10/2026, ao notar que um valor digitado errado não podia ser corrigido.* Hoje só existe criação: a API tem `POST` para despesas e outras receitas, e a taxa só tem o registro de pagamento (`PUT /taxas/:id/pagamento`, sem tela). A edição inclui trocar ou remover o comprovante (apagando o arquivo antigo do disco) e uma tela para registrar o pagamento da taxa. Regras em `regras-de-negocio.md`, seção 4.8. *Implementado em 02/10/2026:* `PUT /financeiro/despesas/:id`, `/outras-receitas/:id` e `/taxas/:id`, modal "Editar" nas listas (despesas e receitas nas telas dos dois perfis, só o admin vê o botão) e "Registrar pagamento / Editar" na tabela de taxas.

### [x] 2.9 Configurações financeiras (valor da taxa por ano, multa, juros e vencimento) — esforço M
*Identificada em 02/10/2026.* Tela do admin para definir o valor da taxa por ano, a multa (padrão 2%), o juros ao mês (padrão 1%) e o dia de vencimento (padrão 10). O valor da taxa pré-preenche o lançamento. Regras na seção 4.6. Prepara o item 2.4 (taxa por fração ideal). *Implementado em 02/10/2026:* tela Cadastro → Configurações financeiras (`GET`/`PUT /financeiro/configuracoes`), com os valores de 2020 a 2026 vindos do seed.

### [x] 2.10 Gerar taxas do mês em lote — esforço M
*Identificada em 02/10/2026.* Hoje o admin lança uma taxa por apartamento (192 por mês). Um botão "Gerar taxas do mês" cria todas com o valor configurado, ignorando as que já existem. Depende do item 2.9. Regras na seção 4.7. *Implementado em 02/10/2026:* `POST /financeiro/taxas/gerar-mes` e o bloco "Gerar taxas" (com valor do ano editável e confirmação), que hoje fica na tela Taxas do mês (item 2.15; nasceu em Cadastro → Taxas de condomínio) e `GET /financeiro/taxas/gerar-mes/previa`.

### [x] 2.11 Juros e multa calculados no pagamento — esforço M
*Identificada em 02/10/2026.* Hoje o registro de pagamento não calcula nem grava juros (só o seed preenche). O servidor passa a calcular multa mais juros simples pro rata a partir da data de pagamento, com prévia na tela e ajuste manual. Depende do item 2.9. Fecha a ambiguidade de juros da seção 7 de `regras-de-negocio.md`. Fórmula na seção 4.1.1. *Implementado em 02/10/2026:* `calcularJuros` em `app/server/src/utils/juros.js`, usado no registro de pagamento e na edição, e prévia em `GET /financeiro/taxas/:id/calculo-juros`.

### [x] 2.12 Excluir lançamentos (cancelamento) — esforço M
*Identificada em 02/10/2026, deixada de fora do item 2.8 de propósito.* Excluir altera saldos e histórico. Precisa de decisão sobre confirmação, exclusão lógica (marcar como cancelado) ou física, e o que fazer com o comprovante. *Implementado em 02/10/2026 como exclusão lógica:* `POST /financeiro/{taxas,despesas,outras-receitas}/:id/cancelar` (motivo de 3 a 200 caracteres) e `/restaurar`, colunas de cancelamento com migração para bancos existentes, listas e totais ignorando cancelados, filtro "Mostrar cancelados" para o admin e botões Cancelar/Restaurar. Taxa paga só cancela depois de remover o pagamento. Regras na seção 4.11. Não há exclusão definitiva nem cancelamento em massa.

### [x] 2.13 Histórico de alterações (auditoria) — esforço G
*Identificada em 02/10/2026.* A edição do item 2.8 sobrescreve o valor anterior sem rastro. Para dado financeiro, convém registrar quem alterou, quando, e o valor antes e depois, com uma tela de consulta. *Implementado em 02/10/2026:* tabela `auditoria` gravada pelas rotas que alteram taxas, despesas, outras receitas e configurações (criar, editar, pagar, recalcular juros, gerar mês), com o antes e o depois, `GET /financeiro/auditoria` (filtros e paginação) e a tela Visualizar → Histórico de alterações. Regras na seção 4.10. Fica de fora a gravação na mesma transação da alteração e o registro de alterações de moradores e de usuários.

### [x] 2.14 Recalcular juros de taxa já paga — esforço P
*Identificada em 02/10/2026.* Corrigir o valor ou a data de pagamento de uma taxa não recalcula o juros já gravado (a tela só mostra o novo cálculo). Avaliar um botão "Recalcular juros" e um aviso quando o juros gravado diverge do calculado. *Implementado em 02/10/2026:* `GET /financeiro/taxas` devolve `juros_calculado` e `juros_diverge`; a tabela de taxas mostra a etiqueta "Difere do cálculo" (com confirmação para regravar) e o modal de edição tem o botão "Recalcular juros"; `POST /financeiro/taxas/:id/recalcular-juros` regrava o juros de uma taxa paga. Regras na seção 4.1.1. Fica de fora um recálculo em massa.

### [x] 2.15 Tela única "Taxas do mês" — esforço M
*Identificada em 02/10/2026, ao revisar a usabilidade do ciclo da taxa.* Hoje o ciclo passa por três telas: gerar (Cadastro → Taxas de condomínio), registrar pagamento (Visualizar → Financeiro) e configurar valor, multa e juros (Cadastro → Configurações financeiras). O link "Ver taxas do mês" e o valor editável na geração reduziram o problema. Uma tela única reuniria, para o mês escolhido, o resumo (geradas, pagas, em aberto), o botão gerar e a tabela com "Registrar pagamento", movendo a tabela de taxas de Visualizar → Financeiro. *Implementado em 02/10/2026:* item **Taxas do mês** no menu principal, com resumo (geradas, adimplentes, a vencer, em atraso e canceladas), geração em lote, tabela com Registrar pagamento, Editar, Cancelar/Restaurar e o filtro por apartamento, e o lançamento individual recolhido no fim. A tabela de taxas saiu de Visualizar → Financeiro (que ganhou um atalho) e o endereço antigo da tela de taxas redireciona. Regras na seção 4.12.

### [ ] 2.16 Acordos: abater o que já foi pago quando o acordo é descumprido ou cancelado — esforço M
*Identificada em 02/10/2026, ao implementar o item 2.7.* Hoje as parcelas pagas continuam como receita, mas **não abatem** as taxas, que voltam ao atraso pelo valor cheio (ponto em aberto na seção 7 de `regras-de-negocio.md`). Decidir a regra (abater nas taxas mais antigas primeiro, proporcional, ou manual) e aplicar, inclusive no juros.

### [ ] 2.17 Acordos: corrigir e ajustar um acordo existente — esforço M
*Identificada em 02/10/2026, ao implementar o item 2.7.* Hoje um acordo não pode ser alterado depois de criado (só cancelado e refeito) e o pagamento de uma parcela não pode ser removido. Itens: remover o pagamento de uma parcela lançada por engano, reparcelar o saldo, tornar a carência de 5 dias configurável e cobrar multa ou juros sobre parcela atrasada.

### [ ] 2.18 Fundo de reserva: aportes e retiradas avulsos e alertas — esforço M
*Identificada em 02/10/2026, ao implementar o item 2.1.* O fundo só tem aportes (percentual da taxa paga) e retiradas (despesas marcadas). Faltam lançamentos avulsos (uma doação, um rendimento, uma retirada que não é despesa), um alerta quando o saldo ficar baixo ou negativo, o aporte pelo percentual do ano do pagamento (hoje é o da referência da taxa) e aportes das parcelas de acordos.

### [ ] 2.19 Rateio de despesas proporcional às unidades — esforço P
*Identificada em 02/10/2026, ao implementar o item 2.3.* O rateio é por igual entre os blocos. Com os 12 blocos de 16 apartamentos o resultado seria o mesmo, mas se a estrutura mudar (bloco com mais ou menos apartamentos) será preciso ratear proporcionalmente ao número de unidades.

### [ ] 2.20 Reaplicar o fator da taxa a um mês já gerado — esforço P
*Identificada em 02/10/2026, ao implementar o item 2.4.* Mudar o fator de um apartamento só vale para as próximas taxas geradas; as já geradas e ainda em aberto ficam com o valor antigo. Avaliar um botão "Reaplicar fator" para as taxas em aberto de um mês, com confirmação e registro no histórico.

### [ ] 2.21 Regime de caixa em mais telas — esforço M
*Identificada em 02/10/2026, ao implementar o item 2.2.* O seletor "Competência | Caixa" vale só para o resumo do mês. Falta oferecê-lo no resumo por bloco, na Evolução (mensal e anual) e na inadimplência.

### [x] 2.22 Estrutura e nomes do condomínio configuráveis (primeiro acesso do administrador) — esforço G
*Identificada e implementada em 07/10/2026, a pedido do usuário, para o sistema servir a outros condomínios.* No primeiro login o administrador cai num **assistente** (`/configuracao-inicial`) e define: o nome do condomínio; como chama o agrupador (bloco, torre, rua…) e a unidade (apartamento, casa…), com plural, abreviação e gênero; quantos agrupadores; se há térreo e como se chama; quantos andares; quantas unidades por andar (ou "sem andares", para casas); e o formato da numeração (`101, 102, 201…` ou sequencial). Há modelos prontos e uma **prévia** antes de gravar. Depois disso a estrutura só cresce (pela API) e os nomes são editáveis em Cadastro → Nomes do condomínio. Os nomes valem nas telas, na ajuda (marcadores `{a.X}`/`{u.X}`) e nas mensagens da API, com concordância de gênero; as chaves técnicas da API (`/blocos`, `bloco_id`…) não mudam. A estrutura deixou de ser criada no boot: `db:reset`/`db:populate` criam a de demonstração (12 × 16), e bancos antigos são tratados como configurados (Bloco/Apartamento, Morada da Lagoa). Tabela `condominio_config`, colunas `ordem` e `andar`; listas ordenadas por `ordem`. Regras nas seções 3.4 e 3.5; cenários na 7.22 de `sugestoes-de-testes.md`; teste de API em `ConfiguracaoCondominioApiTest`. **Decisões:** geometria uniforme, sempre dois níveis, estrutura só cresce, rateio por agrupador inalterado. **Teste do primeiro acesso:** como ele só acontece uma vez por banco, há o script `db:vazio` (banco vazio em arquivo próprio, nunca o de demonstração), a segunda instância da API (`start:vazio`, porta 3002; tela em `dev:vazio`, porta 5174), a classe `PrimeiroAcessoApiTest` (perfil `-Pprimeiro-acesso`) e o roteiro `test/roteiro-primeiro-acesso.md`. **Não feito** (vira itens abaixo): 2.23 a 2.25.

### [ ] 2.23 Estrutura com prédios de tamanhos diferentes — esforço M
*Identificada em 07/10/2026, ao fechar o item 2.22.* O assistente gera agrupadores iguais. Permitir uma linha por prédio (andares, unidades por andar e térreo próprios, com "repetir este") e tratar o rateio, que hoje divide a despesa geral por igual entre os agrupadores e deixaria de ser justo (ligar ao item 2.3, rateio proporcional).

### [ ] 2.24 Acrescentar e organizar a estrutura pela interface — esforço M
*Identificada em 07/10/2026, ao fechar o item 2.22.* Hoje acrescentar um agrupador ou uma unidade só é possível pela API (`POST /blocos`, `POST /apartamentos`), e a tela de cadastro foi descartada em 02/10/2026. Avaliar uma tela simples de acrescentar (com prévia e aviso de que as próximas taxas em lote incluem as unidades novas), e, separadamente, desativar/renumerar unidades, o que exige decidir o destino de moradores, taxas, acordos e histórico.

### [ ] 2.25 Condomínio sem agrupador e trocar a senha do administrador no primeiro acesso — esforço P
*Identificada em 07/10/2026, ao fechar o item 2.22.* Um prédio único hoje é configurado com 1 agrupador, que aparece nas telas; avaliar ocultá-lo quando houver só um. Também: a troca da senha padrão do administrador no assistente é opcional; avaliar torná-la obrigatória.

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

### [ ] 3.12 Executar a suíte de API e criar a de interface (Playwright) — esforço G
*Identificada em 02/10/2026, ao fechar as ondas de melhorias.* As 19 classes de teste de API estão escritas e **compilam, mas nunca foram executadas** (o ambiente de desenvolvimento não tinha Maven nem permitia abrir a porta da API). A suíte de interface (Playwright) não existe, e todos os cenários `E2E` de `sugestoes-de-testes.md` estão sem automação e sem terem sido vistos em navegador. Passos: instalar Maven, rodar `mvn test` com `db:populate` e corrigir o que falhar; criar o projeto Playwright e automatizar os cenários `E2E`; ligar as duas suítes ao pipeline de CI (item 3.7) junto com `npm run verificar:ajuda`.


### [ ] 3.13 Conectar o Jira ao Claude Code (e ao Gemini CLI, escolhendo por uma flag) — esforço M
*Identificada em 07/10/2026, ao avaliar um tutorial gerado pelo Google.* Pré-requisito prático do item 3.11 (fase 1, Jira somente leitura). Mora no repositório `qa-orchestrator` (`docs/integracao-jira.md`).

**Avaliação do tutorial (passos: instalar o Claude Code, gerar token da Atlassian, `claude mcp add --scope user --transport sse atlassian …`, testar listando projetos):**
- O **token do passo 2 não é usado** pelo comando do passo 3: o servidor remoto da Atlassian autentica por OAuth no navegador. Ou se usa OAuth (sem token) ou um servidor local da comunidade (ex.: `mcp-atlassian`, não verificado) que lê o token de variáveis de ambiente.
- O **passo 1 não vale** para o Apple Claude Code: `npm install -g @anthropic-ai/claude-code` instalaria o Claude Code público por cima, sem o gateway da Apple.
- `--scope user` registra o conector em **todos** os projetos; preferir `local` ou `project`. O comando aparece truncado no print, e o endereço `/v1/sse` pode estar sendo substituído por `/v1/mcp` (de memória, confirmar na documentação da Atlassian).
- Faltam: liberar os domínios da Atlassian no Apple Claude Code (Dashboard → Domains; decisão do usuário), começar **somente leitura** e guardar o token no `.env`, nunca em arquivo versionado.

**Desenho proposto para servir aos dois:**
- Fonte única: `.env` com `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY` (com `.env.example` versionado) e **uma** definição do servidor MCP, o que favorece o servidor local com token (OAuth exigiria um login por ferramenta).
- Dois arquivos finos: `.mcp.json` (Claude Code) e `.gemini/settings.json` → `mcpServers` (Gemini CLI, formato não verificado).
- Script `./ia --claude | --gemini` que carrega o `.env` e abre a ferramenta escolhida.
- **Atenção de política:** o Gemini CLI não passa pelo gateway nem pelo sandbox da Apple e envia os dados ao Google. Confirmar se o uso com dados de trabalho é permitido antes de incluir o Gemini.

**Decisões em aberto:** qual Jira (Cloud `atlassian.net` do levantamento do `qa-orchestrator` ou um Jira interno); OAuth ou servidor local com token; incluir o Gemini já na primeira versão ou depois. Passos: [ ] decidir as três questões, [ ] liberar os domínios, [ ] teste de leitura (listar projetos), [ ] arquivos de configuração e script com a flag, [ ] documentar em `docs/integracao-jira.md`.
