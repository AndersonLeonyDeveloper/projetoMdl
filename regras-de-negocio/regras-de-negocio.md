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
| **Proprietário** | Visualizar/editar seus próprios dados e do inquilino vinculado ao seu apartamento; visualizar o financeiro do condomínio (leitura); visualizar sua própria situação de adimplência |
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

## 4. Módulo Financeiro

### 4.1 Receitas — Taxa de Condomínio
- Lançada por apartamento, por mês/ano de referência. Só pode existir **uma taxa por apartamento e mês/ano** (a segunda tentativa retorna 409).
- Campos: valor da taxa, juros (se em atraso), data de pagamento, situação (Adimplente/Inadimplente), comprovante opcional (upload de PDF, JPEG ou PNG — ver seção 6).
- **Valor padrão:** ao lançar uma taxa, o campo "Valor" já vem preenchido com o valor configurado para o ano de referência (seção 4.6). O admin pode alterar o valor antes de salvar.
- **Geração em lote:** o admin pode gerar de uma vez as taxas de um mês para todos os apartamentos (seção 4.7), em vez de lançar uma a uma.
- **Situação é derivada**: se não houver `data_pagamento` registrada até o vencimento, o apartamento passa a `Inadimplente` no mês de referência. Uma taxa recém-lançada ou gerada nasce `Inadimplente` e sem juros. Registrar a data de pagamento a torna `Adimplente`.
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
- **Total inadimplente (mês/bloco)** = soma dos valores de taxa de condomínio em aberto/atrasados.
- Indicadores visuais: saldo positivo (verde/seta para cima) e saldo negativo (vermelho/seta para baixo).

### 4.5 Consultas / Filtros
- Financeiro pode ser filtrado por Ano → Mês → Tipo de receita (Taxa de Condomínio / Outras Receitas) → Bloco.
- Tela de Evolução (Admin): tendência mensal/anual de receitas, despesas, saldo e inadimplência em vários anos (ano inicial/final), com cartões dos últimos 12 meses.
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
- O admin informa mês e ano de referência, e o sistema cria a taxa de **todos os apartamentos** com o valor configurado para aquele ano.
- É necessário haver valor configurado para o ano; sem ele a geração é recusada (400).
- **Idempotente:** apartamentos que já têm taxa naquele mês/ano são **ignorados** (não são duplicados nem alterados). O resultado informa quantas taxas foram criadas e quantas foram ignoradas.
- As taxas nascem `Inadimplente`, sem juros, sem data de pagamento e sem comprovante.

### 4.8 Edição de Lançamentos (Admin)
- O admin pode editar **despesas**, **outras receitas** e **taxas de condomínio** já cadastradas, para corrigir erros de digitação.
- **Despesas e outras receitas:** descrição, valor e data. Mesmas validações do cadastro (campos obrigatórios).
- **Taxas:** valor, juros, data de pagamento e comprovante. **Apartamento e mês/ano de referência não podem ser alterados** (identificam a taxa; para corrigir, é preciso outro lançamento).
  - Informar a data de pagamento torna a taxa `Adimplente` (e zera os meses em atraso); remover a data a torna `Inadimplente` de novo.
  - Se o juros não for informado ao editar com data de pagamento, o sistema calcula (4.1.1). Se for informado, prevalece.
  - Corrigir o valor de uma taxa **não recalcula o juros automaticamente**: o admin vê o cálculo atualizado na tela e decide.
- **Comprovante na edição:** sem arquivo novo, mantém o atual; com arquivo novo, substitui o anterior (o arquivo antigo é apagado do disco); há uma opção para remover o comprovante.
- Os resumos (mensal, por bloco, inadimplência e evolução) refletem o valor editado imediatamente, pois são calculados na consulta.
- **Fora do escopo desta versão:** excluir lançamentos e histórico/auditoria de quem alterou o quê (ver `melhorias-e-ideias.md`, itens 2.12 e 2.13). Hoje a edição **sobrescreve** o valor anterior sem deixar rastro.

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
