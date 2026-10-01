# Sugestões de Testes

> Casos de teste levantados durante a análise das regras de negócio ([`regras-de-negocio.md`](./regras-de-negocio.md))
> e da modelagem de dados ([`modelagem-dados.md`](./modelagem-dados.md)). Pensado para servir de
> backlog de casos ao praticar testes automatizados (Playwright, testes de API/integração, testes
> de banco) e cenários de CI/CD.
>
> Cada item indica o **tipo de teste** mais adequado: `E2E` (UI, Playwright), `API` (requisição
> direta ao backend) ou `DB/Integridade` (consulta/validação direto no banco ou em job de auditoria).
>
> **Ordem sugerida de execução**: segue a sequência natural de um QA explorando um sistema novo —
> primeiro garante que dá para entrar (autenticação), depois que cada perfil vê só o que deve
> (autorização), depois os fluxos principais de cadastro (formulários), depois a camada mais
> profunda de integridade dos dados, depois as regras de cálculo financeiro, e por fim os
> estados vazios/edge cases que normalmente aparecem depois que o caminho feliz já está coberto.

## 1. Autenticação

- [ ] Login com credenciais inválidas exibe mensagem genérica (sem revelar se o e-mail existe).
  `E2E` / `API`
- [ ] Fluxo de recuperação de senha: solicitar nova senha gera token com expiração; usar o token
  após expirado deve falhar; usar o mesmo token duas vezes deve falhar (`used=1`).
  `API`
- [ ] Alterar senha dentro da área logada invalida sessões antigas (se aplicável) ou ao menos exige
  a senha atual para confirmar a troca.
  `E2E` / `API`

## 2. RBAC / Autorização

- [ ] Admin consegue acessar Cadastro de Moradores, Receitas, Despesas e Usuários; Proprietário e
  Inquilino recebem 403/redirecionamento ao tentar acessar essas rotas diretamente pela URL.
  `E2E` / `API`
- [ ] Proprietário/Inquilino só visualizam dados do(s) apartamento(s) vinculado(s) à própria pessoa
  — tentar acessar `apartamento_id` de outro morador via manipulação de URL/payload deve falhar
  (teste de **isolamento de dados** / IDOR).
  `API`
- [ ] Uma pessoa com vínculo em 2 blocos diferentes consegue ver "Meus Apartamentos" listando ambos,
  mas o financeiro pessoal mostra apenas dados de cada apartamento corretamente segregados.
  `E2E`
- [ ] Escalonamento de privilégio: um token/sessão de Inquilino não deve conseguir chamar endpoints
  de escrita de Admin mesmo manipulando o payload da requisição.
  `API`

## 3. Validação de Formulários (Cadastro de Moradores)

- [ ] Confirmação de e-mail divergente do e-mail principal deve bloquear o submit com mensagem de
  erro clara (cadastro de morador, "Meus Dados").
  `E2E`
- [ ] CPF com dígito verificador inválido deve ser rejeitado; CPFs válidos de teste (gerados, não
  reais) devem ser aceitos.
  `E2E` / `API`
- [ ] Campos obrigatórios vazios (nome, telefone, bloco, apartamento) devem impedir o submit e
  destacar o campo correspondente.
  `E2E`
- [ ] Upload de comprovante: aceitar apenas formatos esperados (imagem/PDF) e rejeitar arquivos
  além do tamanho máximo definido.
  `E2E`

## 4. Integridade de Dados

- [ ] **Invariante role × vínculo**: nada impede, hoje, que um `usuarios.role='proprietario'` esteja
  vinculado (via `pessoa_id`) apenas a registros de `moradores` com `tipo='inquilino'` (ou sem
  nenhum vínculo ativo). Isso é regra de aplicação, não de banco.
  `DB/Integridade` — criar teste que: cadastra um usuário com role `proprietario`, vincula a pessoa
  apenas a um vínculo `tipo='inquilino'`, e verifica se a aplicação rejeita/sinaliza a inconsistência
  (na criação do usuário, ou via job de auditoria que varre `usuarios` x `moradores`).
- [ ] **Índice único parcial de proprietário ativo**: tentar inserir um segundo proprietário ativo
  para o mesmo apartamento deve falhar; inserir um novo proprietário após desativar o anterior
  (`ativo=0`) deve funcionar sem violar constraint. Inquilinos ativos não têm limite: inserir 3 ou
  mais inquilinos ativos no mesmo apartamento deve funcionar.
  `DB/Integridade`
- [ ] **Duplicidade de lançamento de taxa**: tentar criar duas `taxas_condominio` para o mesmo
  `(apartamento_id, mes_referencia, ano_referencia)` deve ser rejeitado.
  `API` / `DB/Integridade`
- [ ] **Pessoa com e-mail duplicado**: cadastrar duas pessoas com o mesmo e-mail deve falhar
  (constraint `UNIQUE` em `pessoas.email`).
  `API`
- [ ] **CPF obrigatório condicional**: cadastrar uma pessoa como `proprietario` sem CPF deve ser
  bloqueado pela aplicação (não há CHECK de banco, é regra cross-table); cadastrar como `inquilino`
  sem CPF deve ser permitido.
  `API` / `E2E`
- [ ] **Órfãos ao desativar bloco/apartamento**: excluir um bloco que ainda possui apartamentos deve
  ser bloqueado (`ON DELETE RESTRICT`); desativar um apartamento com moradores ativos deve cascatear
  corretamente (`ON DELETE CASCADE` em `moradores`) sem deixar vínculo órfão.
  `DB/Integridade`

## 5. Regras Financeiras (Cálculos)

- [ ] **Saldo do bloco no mês** = receitas − despesas: validar o cálculo com dataset conhecido
  (valores fixos de entrada) e comparar o resultado exibido na tela/API.
  `API` / `E2E`
- [ ] **Situação adimplente/inadimplente**: lançar uma taxa sem `data_pagamento` até a data de
  vencimento simulada deve resultar em `situacao='inadimplente'`; registrar pagamento deve mudar
  para `adimplente`.
  `API`
- [ ] **Meses em atraso cumulativo**: apartamento inadimplente por 3 meses consecutivos deve exibir
  `meses_atraso=3`; ao pagar o mês mais antigo em atraso, validar se o contador é recalculado
  corretamente (regra de negócio ainda em aberto — ver `regras-de-negocio.md` seção 7).
  `API`
- [ ] **Arredondamento monetário**: valores com centavos (ex.: juros de R$ 0,005) não devem gerar
  diferenças de arredondamento entre o valor salvo e o exibido.
  `API`
- [ ] **Totais consolidados (Admin) batem com a soma dos blocos**: `Total Adimplente` /
  `Total Inadimplente` da tela de inadimplência anual deve ser igual à soma dos valores por bloco/mês.
  `E2E` / `API`

## 6. Estados Vazios / Edge Cases (bons para IA gerar variações)

- [ ] Apartamento sem nenhum morador vinculado — tela de visualização deve tratar o estado vazio
  sem quebrar (sem proprietário nem inquilino).
  `E2E`
- [ ] Bloco sem nenhuma receita/despesa lançada no mês — card deve exibir zero, não erro.
  `E2E`
- [ ] Filtro de mês/ano sem dados históricos (ex.: ano futuro) deve exibir estado vazio amigável.
  `E2E`
- [ ] Paginação/scroll de lista de moradores com volume grande de apartamentos (dataset de carga).
  `E2E` / performance

## 7. Scripts de Carga e Tela de Evolução

> Cenários levantados em 01/10/2026, ao criar `db:seed:moradores`, `db:seed:financeiro` e a tela
> "Evolução". Ver [`dados-de-demonstracao.md`](./dados-de-demonstracao.md).

### 7.1 Estrutura e moradores
- [ ] **Estrutura sobrevive ao reset**: após `db:reset`, devem existir 12 blocos (01–12) e 192 apartamentos
  (16 por bloco: `01–04`, `101–104`, `201–204`, `301–304`); a tela de cadastro de morador lista blocos e
  apartamentos (regressão do bug de listas vazias). `DB/Integridade` / `E2E`
- [ ] **Estrutura é idempotente**: subir o servidor várias vezes não duplica nem apaga blocos/apartamentos.
  `DB/Integridade`
- [ ] **Vários inquilinos ativos**: inserir 3 ou mais inquilinos ativos no mesmo apartamento funciona; um 2º
  proprietário ativo retorna 409 ("Já existe um proprietário ativo para este apartamento."). `API`
- [ ] **Migração do índice**: em banco criado com o índice antigo (`idx_morador_ativo_unico`), subir o
  servidor remove o índice antigo e cria `idx_proprietario_ativo_unico` sem erro. `DB/Integridade`
- [ ] **Carga de moradores**: `db:seed:moradores` gera 768 vínculos (192 × 1 proprietário + 3 inquilinos),
  768 nomes e 768 e-mails distintos, todo apartamento com proprietário, CPF só nos proprietários, e roda
  duas vezes com o mesmo resultado. Mantém admin, blocos, apartamentos e financeiro. `DB/Integridade`
- [ ] **Tela "Dados dos Moradores" com volume**: 192 apartamentos × 4 moradores (768 linhas) carregam,
  filtram e paginam sem travar. `E2E` / performance

### 7.2 Carga financeira
- [ ] **Invariantes das taxas**: 15.552 taxas (81 meses × 192), sem duplicar `(apartamento, mês, ano)` e
  nenhuma depois de set/2026; `adimplente` ⇒ `data_pagamento` preenchida e `meses_atraso = 0`;
  `inadimplente` ⇒ `data_pagamento` nula e `meses_atraso ≥ 1`; `juros ≥ 0`. `DB/Integridade`
- [ ] **Juros por atraso**: pagamento até o dia 10 tem `juros = 0`; depois disso, `juros = valor × (2% + 1% × dias/30)`
  (arredondado a 2 casas). `DB/Integridade`
- [ ] **Meses em atraso consecutivos**: em uma sequência de meses em aberto, `meses_atraso` vai 1, 2, 3…; um mês
  pago zera a contagem. `DB/Integridade`
- [ ] **Idempotência**: `db:seed:financeiro` duas vezes gera os mesmos totais e não toca em moradores.
  `DB/Integridade`
- [ ] **Telas existentes com histórico longo**: Financeiro (ex.: maio/2023, saldo negativo em vermelho) e Taxa de
  Inadimplência (2020 vs 2025) exibem os valores esperados. `E2E`

### 7.3 Tela "Evolução"
- [ ] **RBAC do endpoint**: `GET /financeiro/resumo/evolucao` retorna 401 sem token, 403 para proprietário/inquilino
  e 200 para admin; a rota `/admin/visualizar/evolucao` redireciona não-admins. `API` / `E2E`
- [ ] **Validação de parâmetros**: `ano_inicio` ausente ou maior que `ano_fim` retorna 400. `API`
- [ ] **Totais batem com o seed**: os totais anuais do endpoint (receitas, despesas, saldo) são iguais aos da
  tabela de `dados-de-demonstracao.md` (ex.: 2023 com saldo −R$ 91.569). `API`
- [ ] **Inadimplência no vencimento ≠ em aberto**: o percentual de atraso (pago depois do dia 10 ou em aberto)
  mostra o pico de ~14% em 2020, enquanto "em aberto hoje" fica abaixo de 2% naquele ano. `API` / `E2E`
- [ ] **Visões Mensal e Anual**: alternar a visão mantém os cartões e a tabela; a soma dos meses de um ano é igual
  à linha anual. `E2E`
- [ ] **Filtro de período**: restringir o intervalo (ex.: 2022–2023) atualiza gráficos e tabela; ano inicial maior
  que o final não dispara requisição nem quebra a tela. `E2E`
- [ ] **Estado vazio**: banco sem taxas (após `db:reset`) exibe a tela sem erro, com cartões zerados. `E2E`
- [ ] **Acessibilidade dos gráficos**: legenda visível com duas séries, tooltip ao passar o mouse e tabela anual
  como alternativa textual. `E2E`

## 8. Sugestão de Uso com IA (Playwright + IA)

- Gerar variações automáticas dos casos de "Validação de Formulários" e "Estados Vazios" via prompt
  de IA a partir da tabela de campos em `regras-de-negocio.md` (boa forma de exercitar geração de
  casos de teste combinatórios: campo × tipo de valor inválido).
- Usar os casos de "Integridade de Dados" e "RBAC" como candidatos a testes de API/contrato,
  rodados no pipeline de CI antes dos testes E2E (mais rápidos, detectam regressão de regra de
  negócio sem precisar subir UI).
