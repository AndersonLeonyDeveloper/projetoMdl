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
| **Admin** (síndico) | Cadastrar/editar moradores; lançar e **editar** receitas, despesas e taxas; registrar pagamentos; configurar valor da taxa, multa e juros; gerar as taxas do mês; visualizar financeiro consolidado de todos os blocos; visualizar inadimplência geral; consultar o histórico de alterações financeiras; gerenciar usuários |
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
- **Cancelada:** uma taxa cancelada (seção 4.11) não tem status de pagamento: aparece só para o Admin, como "Cancelada", e não entra em nenhum total.
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
- **Aviso de juros diferente do cálculo:** para taxa paga, a API compara o juros gravado com o cálculo atual (`juros_calculado`, `juros_diverge`; diferença de meio centavo ou mais). Isso acontece quando o valor ou a data foram corrigidos, os percentuais ou o vencimento mudaram, ou o admin informou o juros à mão (acordo). Na tabela de taxas (tela Taxas do mês) aparece a etiqueta "Difere do cálculo".
- **Recalcular juros:** o admin pode regravar o juros de uma taxa **já paga** com o cálculo atual (valor e data de pagamento gravados, percentuais e vencimento de hoje): pela etiqueta "Difere do cálculo" (pede confirmação e grava na hora) ou pelo botão "Recalcular juros" do modal de edição (só preenche o campo; vale ao salvar). Não existe recálculo em massa, e taxa em aberto não tem o que recalcular. Corrigir o valor ou a data **nunca** recalcula o juros sozinho. No seed, só 2 de 15.464 taxas pagas divergem (1 centavo de arredondamento).

### 4.2 Receitas — Outras Receitas
- Não vinculadas a apartamento (nível condomínio): ex. bingo, propaganda, aluguel de espaço, eventos.
- Campos: tipo/descrição, data, valor, comprovante opcional (ver seção 6).

### 4.3 Despesas
- Nível condomínio (não vinculadas a apartamento).
- Campos: tipo/descrição, data, valor, **bloco (opcional)** e comprovante opcional (ver seção 6).
- **Bloco da despesa:** sem bloco, a despesa é **geral** e se divide por igual entre os blocos; com bloco, é **só daquele bloco** (ex.: reparo da cobertura do bloco 07). O bloco precisa existir (400 se não). Na edição, não enviar o campo mantém o bloco atual, e enviá-lo vazio volta a despesa para geral. Só despesas têm bloco; outras receitas são sempre do condomínio todo.
- Exemplos observados no protótipo: produtos de limpeza, manutenção (cerca, muro, quadra, pintura de blocos).

### 4.4 Cálculos
- **Saldo mensal (por bloco)** = receitas do bloco no mês − despesas do bloco no mês, pelo mês de referência.
  - **Receitas do bloco** = taxas pagas dos apartamentos do bloco (valor mais juros) + a **parte do bloco nas outras receitas**, que são do condomínio todo e se dividem por igual entre os blocos.
  - **Despesas do bloco** = despesas lançadas só para o bloco + a **parte do bloco nas despesas gerais** (sem bloco), divididas por igual entre os blocos.
  - **Rateio igualitário:** a divisão é igual entre os blocos (hoje 12), em centavos e sem perda: o que sobra da divisão exata vai de 1 centavo em 1 centavo para os primeiros blocos, então a soma das partes é exatamente o total e as partes diferem no máximo 1 centavo. Não há rateio proporcional às unidades (com 12 blocos de 16 apartamentos daria o mesmo resultado).
  - **Conferência:** a soma dos saldos de todos os blocos é igual ao saldo mensal do condomínio (competência).
  - Taxas em aberto (inadimplentes e a vencer) **não** entram no saldo do bloco; aparecem à parte, nas colunas "Inadimplente" e "A vencer". Cancelados ficam de fora (seção 4.11).
  - Isso **substitui** a conta antiga do saldo do bloco (adimplente − inadimplente). A API devolve, por bloco, `adimplente`, `inadimplente`, `a_vencer`, `outras_receitas_rateadas`, `despesas_especificas`, `despesas_rateadas`, `receitas`, `despesas` e `saldo`.
- **Total adimplente (mês/bloco)** = soma dos valores de taxa de condomínio pagos no prazo.
- **Total inadimplente (mês/bloco)** = soma dos valores de taxa de condomínio **em atraso** (em aberto e já vencidas). Taxas em aberto ainda no prazo aparecem à parte, como **A vencer**, e não entram no inadimplente nem no saldo por bloco. O mesmo vale para a Inadimplência anual e para a Evolução ("em aberto" e "atrasadas"), que usam o dia de vencimento configurado. Para o histórico, nada muda, porque tudo já venceu; só o mês corrente é afetado. Alterar o dia de vencimento em Configurações financeiras reclassifica retroativamente quais taxas contam como atrasadas nesses resumos.
- Indicadores visuais: saldo positivo (verde/seta para cima) e saldo negativo (vermelho/seta para baixo).
- **Regime do resumo do mês (competência ou caixa):** o resumo mensal (receitas, despesas e saldo) pode ser lido de duas formas, escolhidas por um seletor em Visualizar → Financeiro e em Minha Área → Financeiro.
  - **Competência** (padrão): a taxa conta no **mês de referência**, mesmo que paga depois. É o que o sistema sempre mostrou.
  - **Caixa:** a taxa conta no **mês em que foi paga** (data de pagamento), com o juros. Um atraso pago em março entra nas receitas de março, e não nas do mês original.
  - **Não muda** entre os regimes: as despesas e as outras receitas (usam a própria data). Cancelados ficam de fora dos dois.
  - Os dois regimes somam o mesmo total no longo prazo (cada taxa paga entra uma vez); só muda o mês em que cai. No seed, de 2020 a 2026 os totais coincidem.
  - O seletor vale **só para o resumo do mês** (cartões de receitas, despesas e saldo). O resumo por bloco, a inadimplência, a evolução e as listas continuam por competência.
  - API: `GET /financeiro/resumo/mensal?regime=competencia|caixa` (padrão competência; outro valor retorna 400); a resposta informa o `regime` usado.

### 4.5 Consultas / Filtros
- Financeiro pode ser filtrado por Ano → Mês → Tipo de receita (Taxa de Condomínio / Outras Receitas) → Bloco.
- A tabela de taxas da tela **Taxas do mês** (seção 4.12) também pode ser filtrada por **apartamento**, mas só por link (não há campo na tela): os meses em atraso de Dados dos Moradores (seção 4.9) abrem a tela com `ano`, `mes` e `apartamento_id` na URL. Com o filtro ativo, a tela mostra o aviso "Mostrando só as taxas do apartamento BB/AAA" e o botão "Ver todos os apartamentos". O filtro vale só para a tabela de taxas; o resumo do mês, no topo da tela, continua sendo do mês inteiro.
- Tela de Evolução (Admin): tendência mensal/anual de receitas, despesas, saldo e inadimplência em vários anos (ano inicial/final), com cartões dos últimos 12 meses.
- **Evolução para moradores:** em Minha Área → Financeiro, Proprietário e Inquilino veem, no fim da tela, a evolução do condomínio ao longo dos anos (visão mensal ou anual, cartões dos últimos 12 meses, gráfico e resumo anual) com **somente receitas, despesas e saldo**. É a prestação de contas aos condôminos. **Nenhum dado de inadimplência** aparece, nem agregado: sem faturamento, percentual em atraso, unidades em aberto ou "a vencer". Por isso a API pública (`GET /financeiro/resumo/evolucao-publica`, qualquer perfil logado) devolve só `ano`, `mes`, `receitas` (taxas pagas + outras receitas) e `despesas`, e a evolução completa continua restrita ao Admin.
- Tela de Inadimplência: consolidado anual, com drill-down por mês → bloco → apartamento (lista de proprietário/inquilino e situação).

### 4.6 Configurações Financeiras (Admin)
- **Valor da taxa por ano:** um valor de taxa de condomínio para cada ano (ex.: 2026 → R$ 325,00). A taxa muda tipicamente em janeiro, então o valor é por ano e não um único valor "corrente".
- **Percentual de multa por atraso** (padrão 2%, máximo 2%, conforme o Código Civil).
- **Percentual de juros ao mês** (padrão 1%).
- **Dia de vencimento** (padrão 10, de 1 a 28).
- Validações: valores não negativos; multa entre 0 e 2; dia de vencimento entre 1 e 28.
- **Fator da taxa por apartamento:** cada apartamento tem um **fator** (padrão 1,00) que multiplica o valor-base do ano. Serve para taxas que variam com a metragem ou a fração ideal (ex.: 1,20 para uma cobertura). O valor do ano passa a ser entendido como o **valor-base** (o do apartamento com fator 1,00).
  - **Faixa:** de 0,1 a 5, com até 4 casas decimais (arredondado). Fora disso, 400.
  - **Onde vale:** na **geração em lote** (seção 4.7), a taxa de cada apartamento é `valor-base × fator`, arredondada a 2 casas. No lançamento individual o valor sugerido também é `valor-base × fator`, e continua editável.
  - **O que não muda:** taxas já lançadas ou geradas **não são recalculadas** quando o fator muda, e o histórico do seed (todas iguais) não é afetado. O fator vale só do momento da mudança em diante.
  - **Edição (Admin):** em Configurações financeiras, a tabela "Fator da taxa por apartamento" mostra os apartamentos de um bloco, com edição por apartamento e o botão "Aplicar a todo o bloco". O resumo informa quantos apartamentos têm fator diferente de 1,00.
  - **API:** `PUT /apartamentos/:id/fator-taxa` e `POST /blocos/:id/fator-taxa` (só Admin); `GET /apartamentos` devolve `fator_taxa`. Mudanças entram no histórico de alterações (seção 4.10); repetir o mesmo valor não grava.
  - **Não é a fração ideal legal:** os fatores não precisam somar nada em particular, e o sistema não calcula rateio por fração ideal. É um multiplicador simples sobre o valor do ano.
- **Alterar uma configuração não muda lançamentos já criados.** O valor da taxa só pré-preenche e gera taxas novas. Os percentuais só valem para pagamentos registrados depois da alteração.
- Leitura aberta a qualquer usuário autenticado (a tela de lançamento precisa do valor padrão); **alteração só para Admin**.

### 4.7 Gerar taxas do mês (lote)
- Fica na tela **Taxas do mês** (seção 4.12), no menu principal, e vale para o mês e o ano escolhidos no topo da tela.
- O admin informa mês e ano de referência, e o sistema cria a taxa de **todos os apartamentos** com o valor configurado para aquele ano, multiplicado pelo **fator** de cada apartamento (seção 4.6).
- **O valor do ano é editável na própria tela de geração.** Se o ano não tem valor, o campo vem vazio e o admin informa ali mesmo; se o valor digitado difere do configurado, ele é **salvo como o novo padrão do ano** (Configurações financeiras) antes de gerar. Taxas já lançadas não mudam.
- Sem valor para o ano, a geração é recusada (400) pela API, e o botão da tela fica desabilitado até haver um valor maior que zero.
- **Confirmação antes de gerar:** o sistema mostra quantas taxas serão criadas, o valor-base, o mês, quantas já existem (e serão ignoradas) e, se houver, quantos apartamentos têm fator diferente de 1,00 (o valor deles será ajustado). Se todas já existem, informa que não há nada a gerar e não pede confirmação.
- **Prévia na API:** `GET /financeiro/taxas/gerar-mes/previa` devolve o total de apartamentos, as taxas já existentes no mês, quantas seriam criadas, o valor-base do ano (ou `null`) e `com_fator_diferente` (quantos apartamentos têm fator diferente de 1). Não grava nada e é restrita ao admin.
- Depois de gerar, a mesma tela já mostra as taxas criadas, com o resumo do mês atualizado, e é nela que se registram os pagamentos (não é preciso trocar de tela).
- **Idempotente:** apartamentos que já têm taxa naquele mês/ano são **ignorados** (não são duplicados nem alterados). O resultado informa quantas taxas foram criadas e quantas foram ignoradas.
- As taxas nascem `Inadimplente`, sem juros, sem data de pagamento e sem comprovante.

### 4.8 Edição de Lançamentos (Admin)
- O admin pode editar **despesas**, **outras receitas** e **taxas de condomínio** já cadastradas, para corrigir erros de digitação.
- **Despesas e outras receitas:** descrição, valor e data (despesas também o bloco). As mesmas validações valem no cadastro e na edição: descrição não vazia, valor numérico **maior ou igual a zero** e data válida (AAAA-MM-DD); caso contrário, 400 e nada é alterado.
- **Taxas:** valor, juros, data de pagamento e comprovante. **Apartamento e mês/ano de referência não podem ser alterados** (identificam a taxa; para corrigir, é preciso outro lançamento).
  - Informar a data de pagamento torna a taxa `Adimplente` (e zera os meses em atraso). Remover a data a torna `Inadimplente` de novo, **zera o juros** (taxa em aberto não tem juros) e mantém os meses em atraso como estavam (regra de contagem ainda em aberto, seção 7).
  - **Juros ao editar:** o valor informado prevalece. Se não for informado e a data de pagamento estiver sendo definida ou alterada, o sistema calcula (4.1.1). Se a data não mudou, mantém o juros já gravado. A tela preenche o campo com o valor calculado ao escolher uma nova data, e o admin pode ajustá-lo.
  - Corrigir o valor de uma taxa **não recalcula o juros automaticamente**: a tela mostra o cálculo atualizado, avisa quando o juros informado difere dele e oferece "Usar valor calculado"; o admin decide (ver item 2.14 do backlog).
  - A data de pagamento deve ser uma data válida (AAAA-MM-DD). **Datas futuras são aceitas.**
- **Comprovante na edição:** sem arquivo novo, mantém o atual; com arquivo novo, substitui o anterior (o arquivo antigo é apagado do disco); há uma opção para remover o comprovante.
- Os resumos (mensal, por bloco, inadimplência e evolução) refletem o valor editado imediatamente, pois são calculados na consulta.
- **Excluir e histórico:** não há exclusão definitiva; para tirar um lançamento errado usa-se o **cancelamento** (seção 4.11). Toda edição fica registrada no **histórico de alterações** (seção 4.10), com o valor de antes e o de depois.

### 4.9 Situação de pagamento na tela Dados dos Moradores (Admin)
- Em Visualizar → Dados dos Moradores, a coluna **Mensalidades** mostra a situação de pagamento **somente nas linhas de proprietário**. A taxa pertence ao apartamento, e o proprietário é o responsável por ela. Linhas de inquilino em apartamento com proprietário mostram "—". **Exceção:** em apartamento **sem proprietário** (vazio ou só com inquilinos), não há a quem atribuir a dívida, então todas as linhas dele mostram a etiqueta **"Sem proprietário"** (laranja) e, se o apartamento tiver mensalidades em atraso, "N em atraso · sem proprietário", com o mesmo detalhe de valores ao clicar.
- **Em dia:** o proprietário não tem nenhuma mensalidade vencida e não paga.
- **Em atraso:** aparece o texto "N em atraso" (singular "1 em atraso"). Ao clicar, abre uma lista com o **mês e o ano** de cada mensalidade em atraso, da mais antiga para a mais recente (ex.: "mar/2026").
- **O que conta como em atraso:** só a taxa com situação `Inadimplente` cujo **vencimento já passou**. O vencimento é o dia configurado (padrão 10) do mês de referência. No próprio dia do vencimento a taxa ainda **não** é atraso, igual à regra de juros (pagar até o dia do vencimento não gera juros). Uma taxa do mês corrente dentro do prazo, ou de um mês futuro, não conta.
- **Valor devido:** no clique, cada mês mostra o valor da taxa, o **juros calculado até hoje** e o total (ex.: "mar/2026 · R$ 325,00 + R$ 7,58 = R$ 332,58"), e o rodapé traz o **total devido hoje** (soma dos totais). O juros usa a mesma fórmula do pagamento (seção 4.1.1), como se a taxa fosse paga hoje: multa mais juros simples proporcional aos dias de atraso. É uma **estimativa**: o valor final é calculado na data em que o pagamento for registrado, e nada é gravado por essa tela.
- **Link para a taxa:** cada mês do clique é um link para a tela **Taxas do mês** (seção 4.12) naquele mês e ano, **filtrada só pelo apartamento**. A tela mostra o aviso "Mostrando só as taxas do apartamento BB/AAA" e o botão "Ver todos os apartamentos", que limpa o filtro. O resumo do mês continua do mês inteiro. Dali, o admin usa "Registrar pagamento".
- **Alerta de apartamentos sem proprietário:** no topo da tela, quando houver algum, um aviso amarelo informa "N apartamento(s) sem proprietário (X vazio(s), Y só com inquilinos)" e, se algum tiver mensalidades em atraso, quantos são e o total devido hoje. O botão "Mostrar apenas esses" filtra a tabela (e vira "Mostrar todos"). Cada apartamento conta uma vez, mesmo com vários inquilinos.
- A coluna pode ser ordenada pela quantidade em atraso e filtrada por "Em atraso" e "Em dia".
- Visível só para o Admin, porque a tela é restrita ao Admin. A API (`GET /dados-moradores`) devolve `sem_proprietario` em todas as linhas e `taxas_em_atraso`: lista para proprietário e para qualquer linha de apartamento sem proprietário (vazia = em dia), e `null` nas linhas de inquilino de apartamento com proprietário. Cada item traz `id`, `mes_referencia`, `ano_referencia`, `valor`, `dias_em_atraso`, `juros` e `total`, e cada linha traz `apartamento_id`.
- Muda quando: uma taxa é paga (sai da lista), o dia de vencimento é alterado em Configurações financeiras (altera quais meses já venceram) ou passa o dia de vencimento de uma taxa em aberto.

### 4.10 Histórico de alterações (Admin)
- Toda alteração de dado financeiro feita pelo sistema é registrada: **criar, editar, pagar, recalcular juros e gerar taxas do mês** (taxas), **criar e editar** (despesas e outras receitas) e **alterar configurações financeiras**. **Cancelar e restaurar** (seção 4.11) também são registrados, com o motivo.
- Cada registro guarda: **quem** (usuário e e-mail), **quando** (data e hora), **o quê** (tipo e id do lançamento), a **ação**, os **valores de antes e de depois** (só os campos relevantes, como valor, juros, data de pagamento, situação, descrição, data e nome do comprovante) e um **resumo** legível (ex.: "Bl.08/Ap.203 · 03/2026" ou a descrição da despesa).
- **Só se grava quando algo mudou:** salvar uma edição idêntica ao que já existia, ou gerar um mês em que nenhuma taxa foi criada, não gera registro. A geração do mês é **uma linha só**, com a quantidade de taxas criadas e ignoradas (não uma por apartamento).
- **O histórico não pode ser editado nem apagado** pela aplicação: não há rota para isso. Só o `db:reset` e o `db:seed:financeiro` o limpam, porque recriam os dados aos quais ele se refere.
- **Consulta:** Visualizar → Histórico de alterações (só Admin; Proprietário e Inquilino recebem 403). Lista da alteração mais recente para a mais antiga, 20 por página (a API aceita até 200), com filtros por tipo, ação, período (data) e usuário (parte do e-mail). Ao expandir uma linha aparece o que mudou, campo a campo (antes → depois); criações mostram os valores iniciais. O horário aparece no fuso do navegador.
- **Limitações:** o registro é gravado logo depois da alteração, na mesma requisição, mas **não** na mesma transação do banco (uma falha entre as duas gravações deixaria a alteração sem registro). Alterações feitas direto no banco, fora da aplicação, não são registradas.

### 4.11 Cancelar e restaurar lançamentos (Admin)
- Um lançamento lançado por engano (taxa, despesa ou outra receita) é **cancelado**, não excluído: o registro e o comprovante **continuam guardados**, mas ele sai das listas e de todos os totais, e pode ser **restaurado** a qualquer momento. Não existe exclusão definitiva.
- **Motivo obrigatório:** de 3 a 200 caracteres, guardado junto com a data e o usuário que cancelou. Cancelar e restaurar entram no histórico de alterações (seção 4.10).
- **O que um cancelado deixa de contar:** resumo mensal (receitas, despesas e saldo, pelas duas visões), resumo por bloco, inadimplência anual, evolução (completa e pública), as mensalidades em atraso de Dados dos Moradores e as listas de lançamentos. Quem **não é Admin nunca vê** cancelados.
- **Ver cancelados:** o Admin liga "Mostrar cancelados" (ou "Mostrar canceladas") nas listas. Eles aparecem com a etiqueta "Cancelado" (taxas: status "Cancelada"), a descrição riscada e o motivo ao passar o mouse, e com o botão "Restaurar".
- **Regras por tipo:**
  - **Taxa paga não pode ser cancelada**: é preciso remover o pagamento antes (Editar, limpando a data de pagamento). Isso evita sumir com dinheiro recebido.
  - **Cancelado não se altera:** editar, registrar pagamento e recalcular juros retornam 409 até restaurar. Cancelar um já cancelado, ou restaurar um que não está cancelado, também retorna 409.
  - **Taxa cancelada continua ocupando o mês:** lançar outra taxa do mesmo apartamento e mês retorna 409 e orienta a restaurar a cancelada; "Gerar taxas do mês" conta a cancelada como já existente (não cria outra). Para refazer, restaure.
- **Só o Admin** cancela e restaura (403 para os demais). O cancelamento **não apaga o comprovante** do disco.
- Não há cancelamento em massa nem cancelamento de moradores, blocos ou apartamentos.

### 4.12 Tela única "Taxas do mês" (Admin)
- Item **Taxas do mês** no menu principal do Admin (substitui o antigo Cadastro → Taxas de condomínio, cujo endereço antigo redireciona para a tela nova, mantendo os filtros). Reúne **todo o ciclo da taxa de um mês** em uma tela, para o admin não precisar trocar de menu.
- **Topo:** escolha do **mês e ano**. Tudo o que está na tela passa a ser desse mês.
- **Resumo do mês:** quantas taxas foram **geradas** e quantas estão **adimplentes, a vencer e em atraso**, com o valor (taxa mais juros) de cada grupo; se houver, mostra também as **canceladas** (que ficam fora de todos os valores). O resumo é sempre do mês inteiro e não muda com o filtro por apartamento.
- **Gerar taxas:** a geração em lote da seção 4.7, para o mês escolhido no topo, com valor do ano editável, confirmação e resultado na própria tela.
- **Tabela de taxas do mês:** bloco, apartamento, situação (adimplente, a vencer, em atraso ou cancelada), valor, juros (com a etiqueta "Difere do cálculo" da seção 4.1.1), meses em atraso, data de pagamento, comprovante e as ações **Registrar pagamento / Editar** e **Cancelar / Restaurar** (seção 4.11). Filtros por bloco e por situação, e "Mostrar canceladas".
- **Lançar taxa individual:** seção recolhida no fim da tela, para uma taxa avulsa (valor diferente, por exemplo), com o valor padrão do ano já preenchido.
- **O que saiu de Visualizar → Financeiro:** a tabela de taxas. Essa tela continua com o resumo do mês (com o seletor de regime), o resumo por bloco e as listas de despesas e outras receitas, e ganhou um **atalho** que abre Taxas do mês no mesmo mês e ano.
- Quem chega por um mês em atraso de Dados dos Moradores vê a tela filtrada pelo apartamento (seção 4.5).
- Não há mudança de regra nem de API: é uma reorganização das telas.

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
- **Visualização:** o link "Ver comprovante" abre o arquivo em uma nova aba. Está na tabela de taxas da tela Taxas do mês (Admin) e nas listas de outras receitas e despesas do mês, nas telas de Financeiro dos dois perfis. Lançamento sem comprovante mostra "—".
- **Limitações conhecidas:** O protótipo original abria o comprovante em modal; a implementação atual abre em nova aba.

## 7. Pontos de Ambiguidade a Validar (para futura clarificação)

- ~~Regra de rateio de despesas condominiais entre os blocos~~ — definida na seção 4.4: geral dividida por igual entre os blocos, mais despesa de um bloco específico. Segue em aberto o rateio proporcional às unidades, caso a estrutura deixe de ser de 12 blocos iguais.
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
