# Regras de Negócio — Sistema de Gestão de Condomínio

> Documento derivado da análise do protótipo (`prototipo/`) do app "Condomínio Morada da Lagoa".
> Escopo adaptado para uma versão **web** (React + Node/Express + SQLite), voltada à prática de QA
> (testes automatizados com Playwright + IA, pipelines de CI/CD).

## 1. Visão Geral

O sistema gerencia moradores e o financeiro de um condomínio, organizado em **blocos** e
**apartamentos**. Existem três perfis de acesso com permissões distintas.

## 2. Perfis de Usuário e Permissões

| Perfil | Pode fazer |
|---|---|
| **Admin** (síndico) | Cadastrar/editar moradores; lançar e **editar** receitas, despesas e taxas; registrar pagamentos; configurar valor da taxa, multa e juros; gerar as taxas do mês; visualizar financeiro consolidado de todos os blocos; visualizar inadimplência geral; gerenciar usuários |
| **Proprietário** | Visualizar/editar seus próprios dados e do inquilino vinculado ao seu apartamento; visualizar o financeiro do condomínio (leitura, inclusive a evolução de receitas e despesas, sem inadimplência); visualizar sua própria situação de adimplência |
| **Inquilino** | Visualizar seus próprios dados; visualizar o financeiro do condomínio (leitura) |

**Regras de acesso:**
- Um usuário só pode ver/editar dados de moradores vinculados ao(s) apartamento(s) associados à sua conta.
- Proprietário pode ter mais de um apartamento vinculado ("Meus Apartamentos").
- Apenas Admin tem acesso às telas de Cadastro de Receitas, Despesas e Moradores, e às ações de editar lançamentos, registrar pagamento, gerar taxas do mês e alterar as configurações financeiras (Proprietário e Inquilino recebem 403 na API).
- Todos os perfis autenticados têm acesso de leitura ao módulo Financeiro (Receitas/Despesas por mês).

## 3. Módulo Moradores

### 3.1 Entidades
- **Bloco**: identificado por número (ex.: "08").
- **Apartamento**: pertence a um bloco, identificado por número (ex.: "203"). Único por (bloco, número).
- **Pessoa**: identidade única (nome, telefone, CPF, e-mail). Uma pessoa pode ter vínculo com mais de um apartamento (ex.: proprietário de mais de uma unidade — ver tela "Meus Apartamentos").
- **Morador (vínculo)**: liga uma Pessoa a um Apartamento, com tipo `Proprietário` ou `Inquilino`. Uma pessoa pode ter vínculos diferentes em apartamentos diferentes (ex.: proprietária no 203 e inquilina em outra unidade).

### 3.2 Campos do cadastro de morador
| Campo | Obrigatório | Regra de validação |
|---|---|---|
| Bloco | Sim | Deve existir |
| Apartamento | Sim | Deve existir dentro do bloco |
| Tipo (Proprietário/Inquilino) | Sim | Um apartamento pode ter 1 proprietário ativo e vários inquilinos ativos simultaneamente |
| Nome | Sim | — |
| Telefone | Sim | Formato (DD) 9XXXX-XXXX |
| CPF | Sim, apenas se a pessoa possuir algum vínculo do tipo Proprietário | Validação de dígito verificador |
| E-mail | Sim | Formato de e-mail válido, único por pessoa |
| Confirmar e-mail | Sim | Deve ser idêntico ao campo E-mail |

### 3.3 Regras
- Um apartamento pode existir sem inquilino cadastrado (apenas proprietário).
- Editar o morador exige reconfirmação do e-mail (campo "Confirmar e-mail").
- Exclusão/desativação de vínculo é uma ação restrita ao Admin; o histórico de vínculos desativados é preservado (não é hard delete).
- Um apartamento tem no máximo 1 proprietário ativo, mas pode ter vários inquilinos ativos ao mesmo tempo.
- Trocar um inquilino de um apartamento desativa o vínculo dele e cria um novo — não sobrescreve o registro existente.
- Na tela Dados dos Moradores (Admin), a linha do proprietário também mostra a situação das mensalidades do apartamento (seção 4.9). Inquilinos não têm essa informação, exceto em apartamento sem proprietário, que é sinalizado com um aviso e uma etiqueta própria.
- Um apartamento pode ficar sem proprietário (vazio ou só com inquilinos); o sistema não impede, mas avisa o admin em Dados dos Moradores.

### 3.4 Estrutura do condomínio: blocos e apartamentos (somente API)
- A estrutura padrão (blocos 01 a 12, cada um com 16 apartamentos: 01–04, 101–104, 201–204 e 301–304) é garantida sempre que o servidor sobe. Não há tela para cadastrar blocos e apartamentos (a estrutura é fixa); as rotas `POST /blocos` e `POST /apartamentos` existem apenas na API, para o Admin.
- **Número do bloco ou do apartamento:** de 1 a 5 letras ou números, sem espaços nem símbolos. Letras viram maiúsculas. No **bloco**, um único dígito vira dois ("5" vira "05"), igual aos blocos existentes, para não haver "5" e "05" como blocos diferentes.
- **Unicidade:** não pode haver dois blocos com o mesmo número (409) nem dois apartamentos com o mesmo número no mesmo bloco (409). O mesmo número de apartamento pode existir em blocos diferentes.
- O apartamento exige um bloco existente (bloco inexistente retorna 404).
- **Não há exclusão nem edição** de blocos e apartamentos: eles são referenciados por moradores e taxas.
- Um apartamento novo entra nas **próximas** taxas geradas em lote (seção 4.7); meses já gerados não são refeitos. Cadastrar moradores nele segue o fluxo normal (Cadastro → Moradores). Só o Admin cria; qualquer perfil logado pode listar.

## 4. Módulo Financeiro

### 4.1 Receitas — Taxa de Condomínio
- Lançada por apartamento, por mês/ano de referência. Só pode existir **uma taxa por apartamento e mês/ano** (a segunda tentativa retorna 409).
- Campos: valor da taxa, juros (se em atraso), data de pagamento, situação (Adimplente/Inadimplente), comprovante opcional (upload de PDF, JPEG ou PNG — ver seção 6).
- **Valor padrão:** ao lançar uma taxa, o campo "Valor" já vem preenchido com o valor configurado para o ano de referência (seção 4.6). O admin pode alterar o valor antes de salvar.
- **Geração em lote:** o admin pode gerar de uma vez as taxas de um mês para todos os apartamentos (seção 4.7), em vez de lançar uma a uma.
- **Situação é derivada**: se não houver `data_pagamento` registrada até o vencimento, o apartamento passa a `Inadimplente` no mês de referência. Uma taxa recém-lançada ou gerada nasce `Inadimplente` e sem juros. Registrar a data de pagamento a torna `Adimplente`.
- **Status exibido (derivado):** além da situação gravada (Adimplente/Inadimplente), a taxa tem um status calculado na consulta: **Adimplente**; **A vencer** (em aberto, mas o vencimento ainda não passou, no próprio dia do vencimento inclusive); **Em atraso** (em aberto e vencida, ou seja, o dia de vencimento do mês de referência já passou). Isso evita tratar como inadimplente a taxa do mês corrente que ainda está no prazo. A situação gravada não muda; o status acompanha o calendário e o dia de vencimento configurado.
- **Meses em atraso**: contagem cumulativa de meses consecutivos em que o apartamento está sem pagamento — exibido no cadastro (ex.: "3 meses"). Registrar o pagamento zera o contador da taxa.
- **Juros por atraso (calculados pelo sistema):** ao registrar o pagamento, o servidor calcula o juros e grava o valor na taxa (ver 4.1.1).
- **Total pago pelo morador** = valor + juros.

#### 4.1.1 Cálculo de multa e juros
- **Vencimento** = dia de vencimento configurado (padrão: dia 10) do **mês de referência** da taxa.
- **Dias em atraso** = data de pagamento − vencimento, em dias corridos. Pagamento no dia do vencimento ou antes tem 0 dia de atraso e **juros = 0**.
- **Fórmula** (com atraso > 0): `juros = valor × (multa% + juros% ao mês × dias_em_atraso / 30)`, arredondado a 2 casas decimais. Multa é cobrada **uma única vez**; o juros é **simples** (não composto) e proporcional aos dias.
- **Padrões:** multa de 2% e juros de 1% ao mês (art. 1.336, §1º, do Código Civil, que limita a multa a 2%). Os percentuais são configuráveis (seção 4.6).
- Exemplo: taxa de R$ 325,00 paga com 10 dias de atraso: 325 × (0,02 + 0,01 × 10/30) = R$ 7,58; total R$ 332,58.
- **O valor calculado fica gravado na taxa.** Alterar os percentuais depois **não recalcula** pagamentos já registrados.
- **Ajuste manual:** o admin pode informar o juros manualmente (ex.: acordo ou negociação), e o valor informado prevalece sobre o cálculo. Antes de confirmar o pagamento, a tela mostra os dias de atraso, a multa, o juros e o total calculados.
- Taxa em aberto não acumula juros no banco: o juros só é calculado e gravado no momento do pagamento.
- **Aviso de juros diferente do cálculo:** para taxa paga, a API compara o juros gravado com o cálculo atual (`juros_calculado`, `juros_diverge`; diferença de meio centavo ou mais). Isso acontece quando o valor ou a data foram corrigidos, os percentuais ou o vencimento mudaram, ou o admin informou o juros à mão (acordo). Na tabela de taxas aparece a etiqueta "Difere do cálculo".
- **Recalcular juros:** o admin pode regravar o juros de uma taxa **já paga** com o cálculo atual (valor e data de pagamento gravados, percentuais e vencimento de hoje): pela etiqueta "Difere do cálculo" (pede confirmação e grava na hora) ou pelo botão "Recalcular juros" do modal de edição (só preenche o campo; vale ao salvar). Não existe recálculo em massa, e taxa em aberto não tem o que recalcular. Corrigir o valor ou a data **nunca** recalcula o juros sozinho. No seed, só 2 de 15.464 taxas pagas divergem (1 centavo de arredondamento).

### 4.2 Receitas — Outras Receitas
- Não vinculadas a apartamento (nível condomínio): ex. bingo, propaganda, aluguel de espaço, eventos.
- Campos: tipo/descrição, data, valor, comprovante opcional (ver seção 6).

### 4.3 Despesas
- Nível condomínio (não vinculadas a apartamento).
- Campos: tipo/descrição, data, valor, comprovante opcional (ver seção 6).
- Exemplos observados no protótipo: produtos de limpeza, manutenção (cerca, muro, quadra, pintura de blocos).

### 4.4 Cálculos
- **Saldo mensal (por bloco)** = soma(receitas do bloco no mês) − soma(despesas do bloco no mês).
  - Despesas de nível condomínio são rateadas/atribuídas conforme regra a definir (ex.: rateio igualitário entre blocos, ou lançamento manual por bloco).
- **Total adimplente (mês/bloco)** = soma dos valores de taxa de condomínio pagos no prazo.
- **Total inadimplente (mês/bloco)** = soma dos valores de taxa de condomínio **em atraso** (em aberto e já vencidas). Taxas em aberto ainda no prazo aparecem à parte, como **A vencer**, e não entram no inadimplente nem no saldo por bloco. O mesmo vale para a Inadimplência anual e para a Evolução ("em aberto" e "atrasadas"), que usam o dia de vencimento configurado. Para o histórico, nada muda, porque tudo já venceu; só o mês corrente é afetado. Alterar o dia de vencimento em Configurações financeiras reclassifica retroativamente quais taxas contam como atrasadas nesses resumos.
- Indicadores visuais: saldo positivo (verde/seta para cima) e saldo negativo (vermelho/seta para baixo).

### 4.5 Consultas / Filtros
- Financeiro pode ser filtrado por Ano → Mês → Tipo de receita (Taxa de Condomínio / Outras Receitas) → Bloco.
- A tabela de taxas de Visualizar → Financeiro também pode ser filtrada por **apartamento**, mas só por link (não há campo na tela): os meses em atraso de Dados dos Moradores (seção 4.9) abrem a tela com `ano`, `mes` e `apartamento_id` na URL. Com o filtro ativo, a tela mostra o aviso "Mostrando só as taxas do apartamento BB/AAA" e o botão "Ver todos os apartamentos". O filtro vale só para a tabela de taxas; os resumos do mês não mudam.
- Tela de Evolução (Admin): tendência mensal/anual de receitas, despesas, saldo e inadimplência em vários anos (ano inicial/final), com cartões dos últimos 12 meses.
- **Evolução para moradores:** em Minha Área → Financeiro, Proprietário e Inquilino veem, no fim da tela, a evolução do condomínio ao longo dos anos (visão mensal ou anual, cartões dos últimos 12 meses, gráfico e resumo anual) com **somente receitas, despesas e saldo**. É a prestação de contas aos condôminos. **Nenhum dado de inadimplência** aparece, nem agregado: sem faturamento, percentual em atraso, unidades em aberto ou "a vencer". Por isso a API pública (`GET /financeiro/resumo/evolucao-publica`, qualquer perfil logado) devolve só `ano`, `mes`, `receitas` (taxas pagas + outras receitas) e `despesas`, e a evolução completa continua restrita ao Admin.
- Tela de Inadimplência: consolidado anual, com drill-down por mês → bloco → apartamento (lista de proprietário/inquilino e situação).

### 4.6 Configurações Financeiras (Admin)
- **Valor da taxa por ano:** um valor de taxa de condomínio para cada ano (ex.: 2026 → R$ 325,00). A taxa muda tipicamente em janeiro, então o valor é por ano e não um único valor "corrente".
- **Percentual de multa por atraso** (padrão 2%, máximo 2%, conforme o Código Civil).
- **Percentual de juros ao mês** (padrão 1%).
- **Dia de vencimento** (padrão 10, de 1 a 28).
- Validações: valores não negativos; multa entre 0 e 2; dia de vencimento entre 1 e 28.
- **Alterar uma configuração não muda lançamentos já criados.** O valor da taxa só pré-preenche e gera taxas novas. Os percentuais só valem para pagamentos registrados depois da alteração.
- Leitura aberta a qualquer usuário autenticado (a tela de lançamento precisa do valor padrão); **alteração só para Admin**.

### 4.7 Gerar taxas do mês (lote)
- Fica na tela **Cadastro → Taxas de condomínio**, acima do lançamento individual de taxa.
- O admin informa mês e ano de referência, e o sistema cria a taxa de **todos os apartamentos** com o valor configurado para aquele ano.
- **O valor do ano é editável na própria tela de geração.** Se o ano não tem valor, o campo vem vazio e o admin informa ali mesmo; se o valor digitado difere do configurado, ele é **salvo como o novo padrão do ano** (Configurações financeiras) antes de gerar. Taxas já lançadas não mudam.
- Sem valor para o ano, a geração é recusada (400) pela API, e o botão da tela fica desabilitado até haver um valor maior que zero.
- **Confirmação antes de gerar:** o sistema mostra quantas taxas serão criadas, o valor, o mês e quantas já existem (e serão ignoradas). Se todas já existem, informa que não há nada a gerar e não pede confirmação.
- **Prévia na API:** `GET /financeiro/taxas/gerar-mes/previa` devolve o total de apartamentos, as taxas já existentes no mês, quantas seriam criadas e o valor padrão do ano (ou `null`). Não grava nada e é restrita ao admin.
- Depois de gerar, a tela oferece o link **"Ver taxas do mês"**, que abre Visualizar → Financeiro no mês e ano gerados, onde se registram os pagamentos.
- **Idempotente:** apartamentos que já têm taxa naquele mês/ano são **ignorados** (não são duplicados nem alterados). O resultado informa quantas taxas foram criadas e quantas foram ignoradas.
- As taxas nascem `Inadimplente`, sem juros, sem data de pagamento e sem comprovante.

### 4.8 Edição de Lançamentos (Admin)
- O admin pode editar **despesas**, **outras receitas** e **taxas de condomínio** já cadastradas, para corrigir erros de digitação.
- **Despesas e outras receitas:** descrição, valor e data. As mesmas validações valem no cadastro e na edição: descrição não vazia, valor numérico **maior ou igual a zero** e data válida (AAAA-MM-DD); caso contrário, 400 e nada é alterado.
- **Taxas:** valor, juros, data de pagamento e comprovante. **Apartamento e mês/ano de referência não podem ser alterados** (identificam a taxa; para corrigir, é preciso outro lançamento).
  - Informar a data de pagamento torna a taxa `Adimplente` (e zera os meses em atraso). Remover a data a torna `Inadimplente` de novo, **zera o juros** (taxa em aberto não tem juros) e mantém os meses em atraso como estavam (regra de contagem ainda em aberto, seção 7).
  - **Juros ao editar:** o valor informado prevalece. Se não for informado e a data de pagamento estiver sendo definida ou alterada, o sistema calcula (4.1.1). Se a data não mudou, mantém o juros já gravado. A tela preenche o campo com o valor calculado ao escolher uma nova data, e o admin pode ajustá-lo.
  - Corrigir o valor de uma taxa **não recalcula o juros automaticamente**: a tela mostra o cálculo atualizado, avisa quando o juros informado difere dele e oferece "Usar valor calculado"; o admin decide (ver item 2.14 do backlog).
  - A data de pagamento deve ser uma data válida (AAAA-MM-DD). **Datas futuras são aceitas.**
- **Comprovante na edição:** sem arquivo novo, mantém o atual; com arquivo novo, substitui o anterior (o arquivo antigo é apagado do disco); há uma opção para remover o comprovante.
- Os resumos (mensal, por bloco, inadimplência e evolução) refletem o valor editado imediatamente, pois são calculados na consulta.
- **Fora do escopo desta versão:** excluir lançamentos e histórico/auditoria de quem alterou o quê (ver `melhorias-e-ideias.md`, itens 2.12 e 2.13). Hoje a edição **sobrescreve** o valor anterior sem deixar rastro.

### 4.9 Situação de pagamento na tela Dados dos Moradores (Admin)
- Em Visualizar → Dados dos Moradores, a coluna **Mensalidades** mostra a situação de pagamento **somente nas linhas de proprietário**. A taxa pertence ao apartamento, e o proprietário é o responsável por ela. Linhas de inquilino em apartamento com proprietário mostram "—". **Exceção:** em apartamento **sem proprietário** (vazio ou só com inquilinos), não há a quem atribuir a dívida, então todas as linhas dele mostram a etiqueta **"Sem proprietário"** (laranja) e, se o apartamento tiver mensalidades em atraso, "N em atraso · sem proprietário", com o mesmo detalhe de valores ao clicar.
- **Em dia:** o proprietário não tem nenhuma mensalidade vencida e não paga.
- **Em atraso:** aparece o texto "N em atraso" (singular "1 em atraso"). Ao clicar, abre uma lista com o **mês e o ano** de cada mensalidade em atraso, da mais antiga para a mais recente (ex.: "mar/2026").
- **O que conta como em atraso:** só a taxa com situação `Inadimplente` cujo **vencimento já passou**. O vencimento é o dia configurado (padrão 10) do mês de referência. No próprio dia do vencimento a taxa ainda **não** é atraso, igual à regra de juros (pagar até o dia do vencimento não gera juros). Uma taxa do mês corrente dentro do prazo, ou de um mês futuro, não conta.
- **Valor devido:** no clique, cada mês mostra o valor da taxa, o **juros calculado até hoje** e o total (ex.: "mar/2026 · R$ 325,00 + R$ 7,58 = R$ 332,58"), e o rodapé traz o **total devido hoje** (soma dos totais). O juros usa a mesma fórmula do pagamento (seção 4.1.1), como se a taxa fosse paga hoje: multa mais juros simples proporcional aos dias de atraso. É uma **estimativa**: o valor final é calculado na data em que o pagamento for registrado, e nada é gravado por essa tela.
- **Link para a taxa:** cada mês do clique é um link para Visualizar → Financeiro naquele mês e ano, **filtrado só pelo apartamento**. A tela mostra o aviso "Mostrando só as taxas do apartamento BB/AAA" e o botão "Ver todos os apartamentos", que limpa o filtro. Os resumos do mês (receitas, despesas e por bloco) não são filtrados. Dali, o admin usa "Registrar pagamento".
- **Alerta de apartamentos sem proprietário:** no topo da tela, quando houver algum, um aviso amarelo informa "N apartamento(s) sem proprietário (X vazio(s), Y só com inquilinos)" e, se algum tiver mensalidades em atraso, quantos são e o total devido hoje. O botão "Mostrar apenas esses" filtra a tabela (e vira "Mostrar todos"). Cada apartamento conta uma vez, mesmo com vários inquilinos.
- A coluna pode ser ordenada pela quantidade em atraso e filtrada por "Em atraso" e "Em dia".
- Visível só para o Admin, porque a tela é restrita ao Admin. A API (`GET /dados-moradores`) devolve `sem_proprietario` em todas as linhas e `taxas_em_atraso`: lista para proprietário e para qualquer linha de apartamento sem proprietário (vazia = em dia), e `null` nas linhas de inquilino de apartamento com proprietário. Cada item traz `id`, `mes_referencia`, `ano_referencia`, `valor`, `dias_em_atraso`, `juros` e `total`, e cada linha traz `apartamento_id`.
- Muda quando: uma taxa é paga (sai da lista), o dia de vencimento é alterado em Configurações financeiras (altera quais meses já venceram) ou passa o dia de vencimento de uma taxa em aberto.

## 5. Autenticação

- Login por e-mail e senha.
- Fluxo de recuperação de senha: usuário informa e-mail → sistema envia nova senha por e-mail (fluxo "Solicitar" → confirmação).
- Alteração de senha disponível dentro da área logada ("Nova Senha"), tanto para Proprietário quanto Inquilino.
- Cadastro de novo usuário (self-service) redireciona para vínculo com um morador já cadastrado pelo Admin (não permite criar morador "solto").

## 6. Comprovantes (Upload de Arquivo)

> Regras implementadas em 02/10/2026 (item 3.4 de [`melhorias-e-ideias.md`](./melhorias-e-ideias.md)).

- **Aplicável a:** taxa de condomínio, outras receitas e despesas. O campo é **opcional** nos três cadastros: o lançamento é válido sem comprovante.
- **Quem anexa:** só o Admin, no momento do cadastro (e no registro de pagamento da taxa). Proprietário e inquilino não enviam arquivos.
- **Quem visualiza:** qualquer usuário autenticado, Admin ou morador. O arquivo nunca é público: o acesso exige token.
- **Formatos aceitos:** PDF, JPEG e PNG, com até **5 MB** por arquivo e **um arquivo por lançamento**.
- **Validação do arquivo:** o servidor confere o tipo declarado **e** o conteúdo real do arquivo (um executável renomeado para `.pdf` é recusado). Arquivo recusado não cria o lançamento.
- **Armazenamento:** o arquivo vai para o disco do servidor (`app/server/data/comprovantes/`) com nome gerado pelo sistema (UUID + extensão). O nome enviado pelo usuário é descartado. O banco guarda só esse nome em `comprovante_path`.
- **Taxa de condomínio:** o comprovante pode ser anexado ao lançar a taxa, ao registrar o pagamento e ao editar. Enviar um novo arquivo **substitui** o anterior; enviar sem arquivo **mantém** o que já existia.
- **Edição e remoção:** ao editar um lançamento, o admin pode substituir ou **remover** o comprovante. Em ambos os casos o arquivo antigo é apagado do disco (ver 4.8).
- **`comprovante_path` no corpo da requisição é ignorado**: o único caminho para anexar um comprovante é o upload.
- **Visualização:** o link "Ver comprovante" abre o arquivo em uma nova aba. Está na tabela de taxas (Admin) e nas listas de outras receitas e despesas do mês, nas telas de Financeiro dos dois perfis. Lançamento sem comprovante mostra "—".
- **Limitações conhecidas:** O protótipo original abria o comprovante em modal; a implementação atual abre em nova aba.

## 7. Pontos de Ambiguidade a Validar (para futura clarificação)

- Regra de rateio de despesas condominiais entre os blocos.
- ~~Regra exata de cálculo de juros por atraso~~ — definida em 4.1.1: multa única de 2% mais juros simples de 1% ao mês, proporcional aos dias. Segue em aberto se a convenção de cada condomínio pode prever outra regra (juros compostos, multa por mês) e como tratar acordos parcelados (item 2.7 do backlog).
- ~~Se um apartamento pode ter mais de um inquilino~~ — definido: sim, vários inquilinos ativos. Segue em aberto se pode haver mais de um proprietário (hoje: no máximo 1 ativo).
- Regra de expiração/validade da "nova senha" enviada por e-mail.
- **Dívida de quem sai do apartamento:** a coluna Mensalidades (seção 4.9) mostra, para o proprietário atual, **todas** as mensalidades em atraso do apartamento, inclusive as de antes de ele assumir. Hoje a taxa pertence ao apartamento, e não à pessoa. Falta definir se a dívida acompanha o apartamento (comum em condomínios) ou o proprietário da época.
- ~~Apartamento sem proprietário e com atraso~~ — definido na seção 4.9: a tela avisa no topo e mostra o atraso do apartamento nas linhas dele, com a etiqueta "Sem proprietário".
- Contagem de `meses_atraso` ao remover um pagamento ou ao pagar uma taxa antiga com outras em aberto: hoje o registro de pagamento zera o contador da própria taxa, e a remoção do pagamento mantém o valor anterior.

## 8. Ajuda guiada (Admin e moradores)

> Implementada em 02/10/2026 (item 1.4 de [`melhorias-e-ideias.md`](./melhorias-e-ideias.md)). Só existe no cliente; não há regra nem endpoint no servidor.

- **Ícone de ajuda (`?`):** fica sempre visível no cabeçalho, ao lado do e-mail do usuário, em todas as telas logadas, para Admin e moradores. Não há como desligá-lo e não há preferência guardada.
- **Painel de ajuda:** o ícone abre um painel lateral com duas abas.
  - **Nesta tela:** resumo do que a tela faz e o botão "Iniciar tour da tela". Telas sem conteúdo mostram "Esta tela ainda não tem tour".
  - **Como fazer…:** guias por tarefa do perfil. Cada guia lista os passos em ordem, e os passos que mudam de tela têm o botão "Ir para a tela", que navega e fecha o painel.
- **Tour da tela:** só começa quando o usuário clica em "Iniciar tour da tela" (nunca abre sozinho). Destaca, um por vez, os elementos principais da tela, com título, explicação, "Anterior", "Próximo", "Concluir" e botão de fechar. Se o elemento ainda não estiver na tela (por exemplo, tabela carregando), o passo aparece centralizado.
- **Conteúdo por perfil:** o admin vê guias de cadastro de morador, lançamento de despesas e receitas, geração de taxas e registro de pagamentos, correção de lançamentos, configurações financeiras e inadimplência/evolução. Proprietário e inquilino veem guias de Meus Apartamentos, Meus Dados e Financeiro.
- **Manutenção:** os textos e os alvos ficam em `app/client/src/ajuda/conteudo.ts`. Os alvos são os `data-testid` das telas, então renomear um `data-testid` ou mudar um fluxo exige revisar o conteúdo da ajuda. O comando `npm run verificar:ajuda` confere se todos os alvos e rotas da ajuda ainda existem nas telas.
