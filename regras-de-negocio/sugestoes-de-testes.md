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
- [ ] **Estrutura é idempotente** (rodar várias vezes dá o mesmo resultado): subir o servidor várias vezes não duplica nem apaga blocos/apartamentos.
  `DB/Integridade`
- [ ] **Vários inquilinos ativos**: inserir 3 ou mais inquilinos ativos no mesmo apartamento funciona; um 2º
  proprietário ativo retorna 409 ("Já existe um proprietário ativo para este apartamento."). `API`
- [ ] **Migração do índice**: em banco criado com o índice antigo (`idx_morador_ativo_unico`), subir o
  servidor remove o índice antigo e cria `idx_proprietario_ativo_unico` sem erro. `DB/Integridade`
- [ ] **Carga de moradores**: `db:seed:moradores` gera 768 pessoas distintas (192 × 1 proprietário + 3 inquilinos), de
  nomes e e-mails distintos, CPF só nos proprietários, e roda duas vezes com o mesmo resultado. Depois dos cenários de
  borda ficam 763 vínculos ativos (Bl.08/301 vazio e Bl.07/301 sem proprietário) e 1 inativo. Mantém admin, blocos,
  apartamentos e financeiro. `DB/Integridade`
- [ ] **Tela "Dados dos Moradores" com volume**: 192 apartamentos × 4 moradores (cerca de 765 linhas) carregam,
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

### 7.4 Comprovantes (upload e visualização)

> Cenários levantados em 02/10/2026, ao implementar o item 3.4 de [`melhorias-e-ideias.md`](./melhorias-e-ideias.md).
> Regras em [`regras-de-negocio.md`](./regras-de-negocio.md), seção 6. Os marcados `API` já têm teste em
> `test/restassured` (`ComprovantesApiTest`), mas ainda não foram executados.
> Pré-requisito: `npm run db:populate`.

**Upload válido**
- [ ] **Formatos aceitos**: PDF, JPEG e PNG anexados a uma despesa e a uma outra receita retornam 201, e o arquivo
  pode ser baixado depois com o `Content-Type` correto. `API` / `E2E`
- [ ] **Campo opcional**: lançar receita, despesa e taxa sem arquivo continua funcionando e o lançamento fica sem
  comprovante. `API` / `E2E`
- [ ] **Compatibilidade**: o envio em JSON (sem multipart) segue aceito. `API`
- [ ] **Nome gerado pelo servidor**: um arquivo enviado como `../../etc/passwd.pdf` é salvo como `<uuid>.pdf`. `API`
- [ ] **Taxa de condomínio**: anexar no lançamento e no registro de pagamento. Pagar com novo arquivo substitui o
  anterior, e pagar sem arquivo mantém o existente. `API`
- [ ] **`comprovante_path` no corpo é ignorado**: enviar `comprovante_path` em JSON não vincula arquivo nenhum. `API`

**Validação do arquivo**
- [ ] **Conteúdo falso**: arquivo com conteúdo de executável, declarado como `application/pdf`, retorna 400. `API`
- [ ] **Tipo não permitido**: HTML, TXT, GIF, SVG e ZIP retornam 400 (variar tipo e extensão). `API` / `E2E`
- [ ] **Arquivo recusado não cria lançamento**: após o 400, a listagem não contém o lançamento. `API`
- [ ] **Limite de tamanho (valor-limite)**: 5 MB exatos passa (201); 5 MB + 1 byte retorna 413 com mensagem
  citando o limite. `API`
- [ ] **Arquivo vazio** (0 bytes) e **mais de um arquivo** no mesmo envio: comportamento definido e sem erro 500.
  `API` *(ainda sem teste)*
- [ ] **Campos obrigatórios com arquivo**: enviar o arquivo sem descrição ou valor retorna 400. `API`
- [ ] **Conflito de taxa duplicada com arquivo**: lançar de novo a taxa do mesmo apartamento e mês retorna 409 e
  não deixa arquivo órfão no disco. `API` / `DB/Integridade` *(ainda sem teste)*

**Autorização**
- [ ] **Visualizar exige login**: `GET /financeiro/comprovantes/:arquivo` sem token retorna 401. `API`
- [ ] **Os dois perfis veem**: proprietário e inquilino abrem o comprovante (200). `API` / `E2E`
- [ ] **Só o admin anexa**: proprietário e inquilino recebem 403 ao enviar comprovante em receita, despesa e taxa. `API`
- [ ] **Isolamento**: o morador não vê a lista de taxas por apartamento na tela de Financeiro, só receitas e
  despesas do condomínio. `E2E`

**Acesso ao arquivo (segurança)**
- [ ] **Path traversal**: `..%2Fcondominio.sqlite`, `%2E%2E%2F...`, `.env` e `condominio.sqlite` retornam 404 e nunca
  o conteúdo. `API`
- [ ] **Cabeçalhos**: a resposta traz `X-Content-Type-Options: nosniff` e o `Content-Type` da extensão. `API`
- [ ] **Arquivo inexistente** retorna 404 com mensagem, não 500. `API`

**Interface**
- [ ] **Campo nos três formulários**: Taxa, Outras Receitas e Despesas têm "Comprovante (opcional)"; selecionar um
  arquivo e salvar limpa o campo. `E2E`
- [ ] **Validação no cliente**: arquivo de tipo inválido ou acima de 5 MB mostra o erro sem chamar a API. `E2E`
- [ ] **Link "Ver comprovante"**: abre uma nova aba com o PDF ou a imagem; lançamento sem comprovante mostra "—".
  `E2E`
- [ ] **Link em todas as telas**: tabela de taxas (tela Taxas do mês, admin) e listas de receitas/despesas nas telas de
  Financeiro dos dois perfis. `E2E`
- [ ] **Sessão expirada** ao abrir o comprovante redireciona para o login e não deixa aba em branco aberta. `E2E`

**Dados de demonstração**
- [ ] **Exemplos gerados**: após `db:seed:financeiro` existem os 12 arquivos `exemplo-*` e todos abrem (200). `API`
- [ ] **Distribuição**: taxas em aberto não têm comprovante; parte das taxas pagas, receitas e despesas têm. `API`
- [ ] **Reset**: `db:reset` apaga a pasta de comprovantes, e os lançamentos novos voltam a funcionar. `DB/Integridade`

### 7.5 Edição de lançamentos, configurações financeiras, taxas em lote e juros

> Cenários levantados em 02/10/2026. Regras em [`regras-de-negocio.md`](./regras-de-negocio.md), seções 4.1.1 e 4.6 a 4.8
> (itens 2.8 a 2.11 do backlog). Pré-requisito: `npm run db:populate`.
> Os cenários `API` têm teste em `test/restassured` (`EdicaoDeLancamentosApiTest`, `ConfiguracoesFinanceirasApiTest`,
> `GerarTaxasDoMesApiTest` e `JurosNoPagamentoApiTest`), compilados mas ainda não executados. Os `E2E` ainda não têm teste,
> e as telas novas ainda não foram abertas em navegador.

**Edição de despesas e outras receitas**
- [ ] **Corrigir valor, descrição e data**: `PUT` altera o lançamento, a listagem mostra o novo valor e o resumo mensal
  (receitas, despesas, saldo) muda na mesma medida. `API` / `E2E`
- [ ] **Validação**: descrição vazia, valor ausente ou data ausente retornam 400 e o lançamento não muda. `API`
- [ ] **Inexistente**: editar um `id` que não existe retorna 404. `API`
- [ ] **RBAC**: proprietário e inquilino recebem 403; sem token, 401. A coluna "Ações" não aparece para morador. `API` / `E2E`
- [ ] **Valor-limite**: valor 0 e valor com centavos (ex.: 10,005) respeitam a mesma regra do cadastro. `API`
- [ ] **Resumos refletem a edição**: editar uma despesa de um mês reflete no resumo mensal, por bloco e na evolução
  (não em outros meses). `API`

**Comprovante na edição**
- [ ] **Mantém**: editar sem enviar arquivo preserva o `comprovante_path`. `API`
- [ ] **Substitui**: enviar novo arquivo troca o comprovante, e o arquivo antigo deixa de existir (404 ao acessá-lo). `API`
- [ ] **Remove**: a opção de remover deixa `comprovante_path` nulo e apaga o arquivo do disco. `API`
- [ ] **Arquivo inválido na edição** (conteúdo falso ou acima de 5 MB) retorna 400/413 e **não altera nada**, nem os
  outros campos nem o comprovante atual. `API`
- [ ] **Comprovante de exemplo compartilhado**: remover ou trocar o comprovante de um lançamento do seed **não apaga**
  o arquivo `exemplo-*` usado por outros lançamentos. `API`

**Edição de taxas**
- [ ] **Campos editáveis**: valor, juros, data de pagamento e comprovante mudam; `apartamento_id`, mês e ano enviados no
  corpo são ignorados ou recusados. `API`
- [ ] **Situação derivada**: informar a data de pagamento torna a taxa adimplente com `meses_atraso = 0`; remover a data
  volta a inadimplente. `API`
- [ ] **Registrar pagamento pela interface**: o admin abre a taxa em aberto, informa a data, confere a prévia do juros e
  confirma; a linha passa a adimplente. `E2E`
- [ ] **Editar valor não recalcula o juros gravado**: a tela mostra o novo cálculo, mas o juros só muda se o admin
  confirmar. `API` / `E2E`

**Configurações financeiras**
- [ ] **Leitura e escrita**: `GET` para qualquer perfil autenticado, `PUT` só para admin (403 para morador, 401 sem token). `API`
- [ ] **Validações**: valor da taxa negativo; multa acima de 2% ou negativa; juros negativo; vencimento fora de 1–28 retornam
  400 e nada é salvo. `API`
- [ ] **Valor padrão por ano**: o formulário de taxa vem preenchido com o valor do ano escolhido, muda ao trocar o ano,
  e o campo continua editável. Ano sem valor configurado deixa o campo vazio. `E2E`
- [ ] **Alterar a configuração não altera o histórico**: mudar o valor de 2026 não muda as taxas já lançadas. `API`
- [ ] **Seed**: após `db:seed:financeiro`, os valores de 2020 a 2026 coincidem com os usados na carga (230 … 325),
  multa 2%, juros 1% e vencimento dia 10. `API`

**Gerar taxas do mês (lote)**
- [ ] **Cria uma taxa por apartamento**: em um mês sem taxas, gera 192, todas com o valor do ano, inadimplentes, sem juros
  e sem comprovante. `API`
- [ ] **Idempotência**: gerar de novo o mesmo mês não cria nem altera nada (resposta: 0 criadas, 192 ignoradas). `API`
- [ ] **Mês parcialmente lançado**: com algumas taxas já lançadas à mão, gera só as que faltam e **não sobrescreve** o valor
  das existentes. `API`
- [ ] **Ano sem valor configurado** retorna 400 e não cria nada. `API`
- [ ] **Mês/ano inválidos** (mês 0 ou 13, ano ausente) retornam 400. `API`
- [ ] **RBAC**: só admin. `API`
- [ ] **Prévia (`GET .../gerar-mes/previa`)**: em mês cheio devolve `a_criar = 0`; em mês vazio, `a_criar = 192`; em mês
  parcial, a diferença; depois de gerar, `a_criar = 0`. As contagens batem com o resultado do `POST`. `API`
- [ ] **Prévia sem valor**: ano sem padrão devolve `valor = null`. `API`
- [ ] **Prévia: validação e RBAC**: mês 0 ou 13, mês ou ano ausentes retornam 400; morador 403; sem token 401. `API`
- [ ] **Prévia não grava**: chamar a prévia várias vezes não cria taxas. `API`
- [ ] **Interface — localização**: a geração fica na tela Taxas do mês (e não em Receitas / Despesas, que fica só com
  Outras Receitas e Despesas). `E2E`
- [ ] **Interface — valor do ano editável**: o campo vem preenchido com o padrão do ano e muda ao trocar o ano. Em ano sem
  valor vem vazio e o botão fica desabilitado até informar um valor. `E2E`
- [ ] **Interface — salva o padrão**: gerar com um valor diferente do configurado atualiza o padrão do ano
  (Configurações financeiras e o campo "Valor" do lançamento individual passam a mostrá-lo) e não altera taxas já
  lançadas. `E2E`
- [ ] **Interface — confirmação**: o diálogo informa quantidade, valor, mês e ignoradas; cancelar não cria nada; mês já
  totalmente gerado mostra "nada a gerar" sem diálogo. `E2E`
- [ ] **Interface — resultado**: informa quantas taxas foram criadas e quantas ignoradas, e a mesma tela já mostra as taxas
  criadas e o resumo atualizado (a geração usa o mês e o ano escolhidos no topo). `E2E`

**Juros e multa no pagamento**
- [ ] **Sem atraso**: pagar no dia do vencimento ou antes resulta em juros 0. `API`
- [ ] **Valor-limite do vencimento**: pagar no dia 10 → 0 dia de atraso; no dia 11 → 1 dia, com multa de 2% mais
  1/30 do juros mensal. `API`
- [ ] **Fórmula**: taxa de R$ 325,00 paga com 10 dias de atraso resulta em juros de R$ 7,58 e total de R$ 332,58. `API`
- [ ] **Arredondamento**: casos que caem em meio centavo (ex.: R$ 8,125) arredondam como na regra definida e o valor
  salvo é igual ao exibido. `API`
- [ ] **Pagamento em outro mês**: o vencimento é o do **mês de referência** da taxa (pagar a taxa de janeiro/2027 em
  01/03/2027 resulta em 50 dias de atraso, não em atraso do mês corrente). `API`
- [ ] **Vencimento configurável**: mudar o dia de vencimento altera o cálculo dos pagamentos seguintes, mas não o dos
  já registrados. `API`
- [ ] **Ajuste manual**: informar o juros no pagamento (incluindo 0 em um acordo) prevalece sobre o cálculo. `API`
- [ ] **Prévia = valor gravado**: os valores mostrados antes de confirmar (dias, multa, juros, total) são iguais aos
  gravados depois. `E2E`
- [ ] **Total do morador** = valor + juros, e os resumos (adimplente, receitas) usam esse total. `API`
- [ ] **Data de pagamento inválida ou futura**: comportamento definido (recusa ou aceita), sem erro 500. `API`

### 7.6 Ajuda guiada (ícone de ajuda, tour e guias)

> Cenários levantados em 02/10/2026. Regras em [`regras-de-negocio.md`](./regras-de-negocio.md), seção 8 (item 1.4 do
> backlog). Só há interface, então todos os cenários são `E2E`. Ainda sem teste automatizado, e as telas ainda não foram
> abertas em navegador. O tour **nunca abre sozinho**, então não interfere nos outros testes E2E.

**Ícone**
- [ ] **Sempre visível**: o ícone `?` aparece no cabeçalho de todas as telas logadas, para admin e para morador, e não há
  switch para desligá-lo. `E2E`
- [ ] **Nada abre sozinho**: ao entrar em uma tela (inclusive pela primeira vez), nem o painel nem o tour abrem sem um clique. `E2E`

**Tour**
- [ ] **Início**: pelo painel, "Iniciar tour da tela" fecha o painel e inicia o tour da tela atual, também em visitas repetidas. `E2E`
- [ ] **Navegação do tour**: "Próximo" e "Anterior" andam pelos passos, o indicador mostra "N de M", o último passo traz
  "Concluir", e fechar (X) encerra o tour. `E2E`
- [ ] **Destaque**: cada passo com alvo destaca o elemento certo (ex.: em Taxas do mês, o resumo, o bloco "Gerar taxas" e
  a tabela de taxas). `E2E`
- [ ] **Alvo ausente**: com a tabela ainda carregando (ou sem linhas, como o botão "Editar" de uma lista vazia), o passo
  aparece centralizado e o tour não quebra. `E2E`
- [ ] **Telas sem conteúdo**: uma rota sem tour mostra "Esta tela ainda não tem tour" no painel e não inicia tour. `E2E`
- [ ] **Todos os alvos existem**: percorrer o tour de todas as telas de cada perfil confirma que cada passo com alvo encontra o
  elemento na tela (protege contra renomear `data-testid`). A checagem estática `npm run verificar:ajuda` já cobre a
  existência no código; o E2E cobre a presença na tela renderizada. `E2E`
- [ ] **Verificador da ajuda**: `npm run verificar:ajuda` passa com o conteúdo atual e falha (código 1) quando um alvo ou uma
  rota da ajuda não existe nas telas. `Build`
- [ ] **Não bloqueia o uso**: com o tour fechado, formulários e botões funcionam normalmente; com o tour aberto, ele cobre a
  tela (esperado). `E2E`

**Painel e guias**
- [ ] **Abrir e fechar**: o ícone `?` abre o painel com as abas "Nesta tela" e "Como fazer…"; fechar pelo X ou clicando fora. `E2E`
- [ ] **Resumo da tela**: a aba "Nesta tela" mostra o resumo da tela atual e muda ao navegar. `E2E`
- [ ] **Conteúdo por perfil**: o admin vê 6 guias (cadastrar morador, taxas do mês, despesa/receita, corrigir lançamento,
  configurar taxa, inadimplência e evolução); proprietário e inquilino veem 3 (apartamentos, dados, financeiro). `E2E`
- [ ] **Ir para a tela**: o botão de um passo navega para a rota certa e fecha o painel (ex.: guia "Gerar as taxas do mês",
  passo 1 → Taxas do mês). `E2E`
- [ ] **Texto confere com a tela**: os passos de cada guia batem com os nomes reais de menus e botões (revisar quando
  uma tela mudar). `E2E` / revisão manual
- [ ] **Morador não vê conteúdo de admin**: a ajuda de um morador não traz guias nem links de rotas de admin. `E2E`

### 7.7 Coluna "Mensalidades" em Dados dos Moradores

> Cenários levantados em 02/10/2026. Regras em [`regras-de-negocio.md`](./regras-de-negocio.md), seção 4.9 (item 1.6 do
> backlog). Os `API` têm teste em `test/restassured` (`DadosMoradoresApiTest`, compilado e ainda não executado, e os
> testes novos de valor devido e filtro dependem de haver mensalidades em atraso no banco). Os `E2E`
> ainda não têm teste, e a tela ainda não foi aberta em navegador.

- [ ] **RBAC**: `GET /dados-moradores` retorna 200 para admin, 403 para proprietário e inquilino, 401 sem token. `API`
- [ ] **Formato por tipo**: linha de proprietário traz `taxas_em_atraso` como lista (vazia = em dia); inquilino de apartamento com
  proprietário traz `null`. Em apartamento **sem proprietário** (vazio ou só com inquilinos), todas as linhas trazem
  `sem_proprietario = true` e a lista de atraso do apartamento. `API`
- [ ] **Taxa antiga em aberto conta**; **taxa futura não conta**; a lista vem do mês mais antigo ao mais recente. `API`
- [ ] **Pagar tira da lista**: depois de registrar o pagamento, o mês some; taxa paga com atraso (adimplente) não conta. `API`
- [ ] **Valor-limite do vencimento**: com o dia de vencimento igual a hoje, a taxa do mês corrente ainda não é atraso; com o
  dia anterior, é. (O teste só roda entre os dias 2 e 28 do mês.) `API`
- [ ] **Configuração muda o resultado**: alterar o dia de vencimento altera quais meses contam como vencidos. `API`
- [ ] **Taxas geradas e no prazo não contam**: depois de "Gerar taxas do mês" para o mês corrente, nenhum proprietário
  passa a aparecer em atraso por causa delas. `API` / `E2E`
- [ ] **Consistência**: a soma de mensalidades em atraso nunca passa do total de taxas inadimplentes, e bate com a
  consulta direta às taxas vencidas no mesmo critério. `API` / `DB/Integridade`
- [ ] **`sem_proprietario` consistente**: vale exatamente para os apartamentos sem nenhuma linha de proprietário; ao reativar o
  proprietário, o apartamento deixa de ser marcado e os inquilinos voltam a `null`. `API`
- [ ] **Cenários do seed**: Bl.08/301 (vazio) e Bl.07/301 (só inquilinos) aparecem como sem proprietário. `API`
- [ ] **Atraso do apartamento sem dono**: uma taxa vencida em aberto de um apartamento sem proprietário aparece nas linhas
  dele (e no total do aviso); uma taxa a vencer não. `API`
- [ ] **Aviso no topo**: com ao menos um apartamento sem proprietário, o aviso mostra a contagem (vazios e só inquilinos, cada
  apartamento uma vez) e, havendo atraso, quantos e o total devido; sem nenhum, o aviso não aparece. `E2E`
- [ ] **Filtro do aviso**: "Mostrar apenas esses" mostra só as linhas de apartamentos sem proprietário e o botão vira "Mostrar
  todos". `E2E`
- [ ] **Etiqueta**: nessas linhas a coluna Mensalidades mostra "Sem proprietário" (ou "N em atraso · sem proprietário", com o
  popover de valores). `E2E`
- [ ] **Exibição**: "Em dia" em verde, "N em atraso" em vermelho (singular "1 em atraso"), "—" nas linhas de inquilino e de
  apartamento vazio. `E2E`
- [ ] **Detalhe ao clicar**: o clique em "N em atraso" abre a lista com "mês/ano" de cada mensalidade (ordem do mais antigo
  ao mais recente) e fecha ao clicar fora; clicar em outra linha mostra a lista dela. `E2E`
- [ ] **Ordenação e filtro**: ordenar pela coluna agrupa por quantidade (linhas sem coluna ficam por último ou primeiro, de
  forma consistente); o filtro "Em atraso" mostra só proprietários com atraso e "Em dia" só os sem atraso. `E2E`
- [ ] **Valor devido por mês**: cada item traz `id`, `valor`, `dias_em_atraso`, `juros` e `total`, com `total = valor + juros`
  e `dias_em_atraso > 0`; o `id` é o da taxa certa; cada linha da resposta traz `apartamento_id`. `API`
- [ ] **Juros = prévia de hoje**: o juros estimado de cada mês é igual ao de `GET /financeiro/taxas/:id/calculo-juros` com a data
  de hoje (mesma fórmula da seção 4.1.1); em atraso há 1 dia, multa + 1/30 do juros mensal. `API`
- [ ] **Configuração e pagamento mudam o valor**: mudar multa ou juros muda o estimado; pagar a taxa tira o mês da lista e reduz o
  total devido. `API`
- [ ] **Filtro por apartamento**: `GET /financeiro/taxas?ano&mes&apartamento_id` devolve só a taxa daquele apartamento no mês, e
  uma lista vazia para um apartamento inexistente. `API`
- [ ] **Popover com valores**: mostra valor, juros e total por mês e o "Total devido hoje" (soma dos totais), com a nota de
  que é estimativa. `E2E`
- [ ] **Link do mês**: clicar em um mês abre Taxas do mês no mês e ano certos, com o aviso "Mostrando só as taxas do
  apartamento BB/AAA" e uma única taxa na tabela; o resumo do mês não muda com o filtro. `E2E`
- [ ] **Limpar o filtro**: "Ver todos os apartamentos" remove o aviso e volta à lista completa do mês. `E2E`
- [ ] **Fluxo completo**: do link, "Registrar pagamento" funciona e, ao voltar para Dados dos Moradores, aquele mês saiu da
  lista e do total. `E2E`
- [ ] **Link inválido**: `apartamento_id` inexistente ou não numérico na URL mostra a lista vazia (ou a completa, no caso não
  numérico) sem quebrar a tela. `E2E`
- [ ] **Volume**: com os 768 moradores e paginação, a tela carrega sem lentidão perceptível e a coluna aparece em todas as
  páginas. `E2E` / performance

### 7.8 Carga de dados (`db:populate`) e logins de teste

> Cenários levantados em 02/10/2026 (itens 3.1 a 3.3 do backlog). Detalhes em [`dados-de-demonstracao.md`](./dados-de-demonstracao.md).

- [ ] **Banco novo**: em um banco sem nenhum dado, `npm run db:populate` termina sem erro, cria o administrador e deixa 192
  apartamentos, 763 vínculos ativos e 1 inativo, 15.552 taxas e os 7 valores de taxa por ano. `DB/Integridade`
- [ ] **Idempotência**: rodar `db:populate` duas vezes dá exatamente o mesmo resultado (mesmos totais, nomes e valores) e um
  único administrador. `DB/Integridade`
- [ ] **Falha no meio**: se uma etapa falhar, o comando para, informa qual etapa e sai com código diferente de zero. `DB/Integridade`
- [ ] **Logins de teste**: `admin@`, `anderson@`, `maria@`, `carlos.inquilino@` e os da amostra
  (`proprietario.bloco01@` a `03`, `inquilino.bloco01@` a `03`) entram com `senha123`. `API`
- [ ] **Ligação dos logins**: o Anderson vê 2 apartamentos (Bl.08/203 e Bl.09/101); Maria vê Bl.08/101; Carlos vê Bl.08/203. `API`
- [ ] **Sem login para o restante**: um morador gerado fora da lista não consegue entrar. `API`
- [ ] **Cenários de borda**: Bl.08/301 sem morador; Bl.07/301 só com inquilinos; Bl.09/204 com inquilino desativado que não
  aparece em Dados dos Moradores. `API` / `E2E`
- [ ] **Sem pessoas órfãs**: depois da carga, nenhuma pessoa fica sem vínculo e sem login. `DB/Integridade`

### 7.9 Carregamento sob demanda das telas

> Cenários levantados em 02/10/2026 (item 3.5 do backlog). Só interface.

- [ ] **Cada tela abre**: percorrer todas as telas dos dois perfis pelo menu mostra o conteúdo certo, depois de um indicador de
  carregamento curto, sem tela em branco nem erro no console. `E2E`
- [ ] **Navegação direta por URL** (colar `/admin/visualizar/evolucao`, recarregar a página) abre a tela certa. `E2E`
- [ ] **Evolução separada**: ao abrir só o login e a primeira tela, o arquivo da biblioteca de gráficos não é baixado; ele só
  é pedido ao entrar em Evolução. `E2E` / performance
- [ ] **Falha de rede ao carregar uma tela**: com o arquivo da tela indisponível, a aplicação não fica travada (comportamento
  definido: mensagem ou nova tentativa). `E2E`
- [ ] **Tamanho**: o pacote de entrada do build fica abaixo de 300 kB. `E2E` / performance

### 7.10 Status "a vencer" e resumos

> Cenários levantados em 02/10/2026 (item 2.5 do backlog). Regras em [`regras-de-negocio.md`](./regras-de-negocio.md), seções 4.1
> e 4.4. Os `API` têm teste em `test/restassured` (`StatusDaTaxaApiTest`, compilado e ainda não executado).

- [ ] **Status coerente**: toda taxa devolvida traz `status`; as adimplentes são `adimplente` e as em aberto são `a_vencer` ou
  `em_atraso`. `API`
- [ ] **Mês passado em aberto = em atraso; mês futuro = a vencer; pagar = adimplente.** `API`
- [ ] **Valor-limite**: com o dia de vencimento igual a hoje, a taxa do mês corrente é `a_vencer`; no dia anterior, `em_atraso`
  (só roda entre os dias 2 e 28). `API`
- [ ] **Resumo por bloco**: taxa de mês futuro soma em `a_vencer` e nada em `inadimplente`; taxa de mês passado soma em
  `inadimplente` e nada em `a_vencer`; `inadimplente + a_vencer` é o total em aberto do mês. `API`
- [ ] **Histórico não muda**: de 2020 a 2025, `a_vencer` é 0 e "inadimplente", "atrasadas" e "em aberto" são iguais aos do
  cálculo anterior. `API` / `DB/Integridade`
- [ ] **Inadimplência anual e Evolução**: taxa de mês futuro não conta como inadimplente, atrasada nem em aberto, e aparece em
  `a_vencer`. `API`
- [ ] **Vencimento configurável**: mudar o dia de vencimento reclassifica o que é atrasado e a vencer nos resumos do mês
  corrente (e as "atrasadas" históricas da Evolução). `API`
- [ ] **Consistência com Dados dos Moradores**: uma taxa `a_vencer` não aparece em "N em atraso", e uma `em_atraso` aparece. `API`
- [ ] **Etiquetas**: "Adimplente" verde, "A vencer" azul, "Em atraso" vermelha na tabela de taxas, com filtro por status; a
  tabela de resumo por bloco (admin e morador) e a de Inadimplência mostram a coluna "A vencer". `E2E`
- [ ] **Gerar taxas do mês corrente**: depois de gerar, todas aparecem como "A vencer" e nenhuma como "Em atraso" até o dia
  seguinte ao vencimento. `E2E`

### 7.11 Aviso de juros diferente do cálculo e recalcular

> Cenários levantados em 02/10/2026 (item 2.14 do backlog). Regras na seção 4.1.1 de [`regras-de-negocio.md`](./regras-de-negocio.md).
> Os `API` têm teste em `test/restassured` (`RecalcularJurosApiTest`, compilado e ainda não executado).

- [ ] **Sem divergência**: taxa paga com o cálculo normal traz `juros_diverge = false` e `juros_calculado` igual ao gravado; taxa em
  aberto traz `juros_calculado = null` e `juros_diverge = false`. `API`
- [ ] **Ajuste manual diverge**: juros informado à mão (ex.: R$ 1,50 em vez de R$ 7,58) marca `juros_diverge = true`. `API`
- [ ] **Recalcular regrava**: `POST /financeiro/taxas/:id/recalcular-juros` devolve `juros_anterior`, `juros` e `total`, grava o
  cálculo atual e a taxa deixa de divergir. `API`
- [ ] **Corrigir o valor não recalcula**: depois de editar o valor de uma taxa paga, o juros gravado fica e a taxa passa a
  divergir; recalcular acompanha o novo valor (ex.: 425 × (2% + 1% × 10/30) = R$ 9,92). `API`
- [ ] **Percentuais mudam o resultado**: mudar o juros ao mês marca como divergentes as taxas pagas com atraso, e recalcular usa os
  percentuais de hoje (ex.: 5% ao mês, 10 dias = R$ 11,92). `API`
- [ ] **Erros**: taxa em aberto 400, inexistente 404, morador 403, sem token 401. `API`
- [ ] **Seed**: só 2 taxas pagas divergem (1 centavo de arredondamento) e nenhuma em aberto. `API` / `DB/Integridade`
- [ ] **Etiqueta**: a tabela de taxas mostra "Difere do cálculo" ao lado do juros divergente; clicar abre a confirmação com o valor
  gravado e o calculado; confirmar atualiza a linha e a etiqueta some. `E2E`
- [ ] **Botão do modal**: "Recalcular juros" preenche o campo com o cálculo, não grava até clicar em Salvar, e some quando o
  campo já é igual ao cálculo. `E2E`

### 7.12 Blocos e apartamentos (somente API)

> Cenários levantados em 02/10/2026 (item 1.3 do backlog; a tela foi descartada, ficou só a API). Regras na seção 3.4 de [`regras-de-negocio.md`](./regras-de-negocio.md).
> Os `API` têm teste em `test/restassured` (`EstruturaApiTest`, compilado e ainda não executado). Os testes deixam blocos e
> apartamentos novos no banco (não há exclusão).

- [ ] **Criar bloco**: devolve o número normalizado (maiúsculas), aparece em `GET /blocos` e uma segunda criação do mesmo número
  retorna 409 (também trocando maiúsculas e minúsculas). `API`
- [ ] **Um dígito vira dois**: criar o bloco "5" (ou o número 5) retorna 409 porque "05" já existe; num banco sem o bloco 05,
  cria "05". `API`
- [ ] **Bloco inválido** (vazio, só espaços, com espaço no meio, símbolos, mais de 5 caracteres, sem o campo) retorna 400. `API`
- [ ] **Criar apartamento**: devolve 201; o mesmo número no mesmo bloco retorna 409; o mesmo número em outro bloco é aceito. `API`
- [ ] **Bloco inexistente** ao criar apartamento retorna 404 (antes era erro interno). `API`
- [ ] **Apartamento inválido** (vazio, espaços, símbolos, longo demais) ou sem `bloco_id`/`numero` retorna 400. `API`
- [ ] **Entra no lote**: depois de criar um apartamento, o total de apartamentos da prévia de "Gerar taxas do mês" aumenta em 1, e
  a geração do mês seguinte cria a taxa dele (meses já gerados não são refeitos). `API`
- [ ] **A estrutura padrão sobrevive**: reiniciar o servidor não duplica nem remove blocos e apartamentos criados à mão. `API` / `DB/Integridade`
- [ ] **RBAC**: morador recebe 403 ao criar, 401 sem token, e qualquer perfil logado lista. `API`

### 7.13 Evolução do condomínio para moradores

> Cenários levantados em 02/10/2026 (item 1.2 do backlog). Regras na seção 4.5 de [`regras-de-negocio.md`](./regras-de-negocio.md).
> Os `API` têm teste em `test/restassured` (`EvolucaoPublicaApiTest`, compilado e ainda não executado).

- [ ] **Acesso**: proprietário, inquilino e admin recebem 200 em `GET /financeiro/resumo/evolucao-publica`; sem token, 401; período
  inválido ou ausente, 400. `API`
- [ ] **Sem inadimplência**: cada linha tem só `ano`, `mes`, `receitas` e `despesas`, e o texto da resposta não contém
  faturamento, atraso, em aberto, unidades nem inadimplência. `API`
- [ ] **Bate com o admin**: `receitas` é igual a taxas pagas + outras receitas da evolução do admin, e `despesas` é igual, mês a mês. `API`
- [ ] **Evolução do admin segue restrita**: proprietário e inquilino recebem 403 em `GET /financeiro/resumo/evolucao`. `API`
- [ ] **Tela do morador**: o fim de Minha Área → Financeiro mostra "Evolução do condomínio" com os cartões de receitas, despesas e
  saldo (12 meses), o gráfico de receitas e despesas e o resumo anual (Ano, Receitas, Despesas, Saldo). `E2E`
- [ ] **Nada de inadimplência na tela**: não aparecem os cartões "Em atraso no último mês" e "Unidades com 3+ meses em aberto", o
  gráfico de Inadimplência nem as colunas Faturamento, "Em atraso no vencimento" e "Em aberto hoje". `E2E`
- [ ] **Filtros**: trocar ano inicial e final e alternar Mensal/Anual atualiza os gráficos e a tabela, como na tela do admin. `E2E`
- [ ] **Admin inalterado**: a tela Visualizar → Evolução continua com todos os cartões, os dois gráficos e todas as colunas. `E2E`
- [ ] **Carregamento sob demanda**: a biblioteca de gráficos só é baixada ao abrir Financeiro (morador) ou Evolução (admin). `E2E` / performance

### 7.14 Histórico de alterações (auditoria)

> Cenários levantados em 02/10/2026 (item 2.13 do backlog). Regras na seção 4.10 de [`regras-de-negocio.md`](./regras-de-negocio.md).
> Os `API` têm teste em `test/restassured` (`AuditoriaApiTest`, compilado e ainda não executado).

- [ ] **Criar e editar**: criar e editar uma despesa gera duas linhas (mais recente primeiro) com ação, usuário, valores de antes
  (nulo na criação) e de depois. `API`
- [ ] **Sem mudança, sem registro**: editar uma despesa, uma taxa ou a configuração com os mesmos valores não grava linha. `API`
- [ ] **Ciclo da taxa**: criar, pagar, editar e recalcular juros geram uma linha cada, na ordem, e o resumo tem o formato
  "Bl.XX/Ap.YYY · MM/AAAA". `API`
- [ ] **Gerar o mês**: gera uma linha com as contagens (criadas e ignoradas); gerar de novo, com 0 criadas, não grava. `API`
- [ ] **Configuração**: alterar multa, juros, vencimento ou o valor de um ano grava, e o antes/depois traz o valor da taxa por ano. `API`
- [ ] **Todas as rotas gravam**: cada rota que altera taxa, despesa, outra receita ou configuração deixa registro (conferir uma
  a uma, inclusive receitas). `API`
- [ ] **Filtros**: por tipo, ação, id da entidade, usuário (parte do e-mail) e período; um período sem alterações volta vazio;
  data inválida retorna 400. `API`
- [ ] **Paginação**: ordem decrescente, páginas sem repetir linhas, total estável, limite máximo de 200. `API`
- [ ] **Imutável e restrito**: morador 403, sem token 401; não existe rota para editar ou apagar um registro (404). `API`
- [ ] **Reset**: `db:reset` e `db:seed:financeiro` limpam o histórico. `DB/Integridade`
- [ ] **Quem fez**: a alteração feita por outro admin aparece com o e-mail dele. `API`
- [ ] **Tela**: a lista mostra data e hora no fuso local, quem, o quê, a ação (etiqueta colorida) e o resumo; a seta expande e
  mostra "campo: antes → depois"; criações mostram só os valores iniciais. `E2E`
- [ ] **Filtros da tela**: tipo, ação, período e usuário reduzem a lista, voltam à primeira página e podem ser limpos; sem resultado,
  aparece "Nenhuma alteração registrada para esse filtro". `E2E`
- [ ] **Visualizar → Histórico** só existe no menu do admin, e `/admin/visualizar/historico` redireciona o morador. `E2E`

### 7.15 Cancelar e restaurar lançamentos

> Cenários levantados em 02/10/2026 (item 2.12 do backlog). Regras na seção 4.11 de [`regras-de-negocio.md`](./regras-de-negocio.md).
> Os `API` têm teste em `test/restassured` (`CancelamentoApiTest`, compilado e ainda não executado).

- [ ] **Ciclo (despesa e outra receita)**: cancelar tira da lista padrão e do resumo mensal; com `incluir_cancelados` o admin vê o
  registro com motivo e data; restaurar devolve à lista e ao resumo. `API`
- [ ] **Motivo**: ausente, com 2 caracteres, só espaços ou com 201 retorna 400; com 200 caracteres passa. `API`
- [ ] **Estados inválidos**: cancelar de novo, restaurar quem não está cancelado e editar um cancelado retornam 409. `API`
- [ ] **Acesso**: morador 403 ao cancelar e restaurar, sem token 401, inexistente 404; o morador não vê cancelados nem com
  `incluir_cancelados`. `API`
- [ ] **Taxa cancelada**: some de `GET /taxas`, do resumo por bloco e de "N em atraso"; com o filtro aparece com status
  `cancelada`. `API`
- [ ] **Totais**: resumo mensal (competência e caixa), por bloco, inadimplência anual, evolução (admin e pública) e Dados dos
  Moradores ignoram cancelados e voltam ao normal ao restaurar. `API`
- [ ] **Taxa cancelada não muda**: registrar pagamento, editar e recalcular juros retornam 409. `API`
- [ ] **Taxa paga não cancela**: retorna 409 orientando a remover o pagamento; depois de limpar a data de pagamento, cancela. `API`
- [ ] **Taxa cancelada ocupa o mês**: lançar outra para o mesmo apartamento e mês retorna 409 citando a cancelada; gerar o mês a
  conta como existente (0 criadas para ela) e a prévia a inclui em `existentes`. `API`
- [ ] **Comprovante preservado**: o arquivo de um lançamento cancelado continua acessível e volta a aparecer ao restaurar. `API`
- [ ] **Histórico**: cancelar e restaurar geram linhas na auditoria, com o motivo no depois. `API`
- [ ] **Migração**: abrir um banco criado antes do cancelamento acrescenta as colunas sem perder dados, e abrir de novo não falha. `DB/Integridade`
- [ ] **Interface**: "Cancelar" abre um diálogo que só habilita com 3 caracteres no motivo; depois de cancelar a linha some, e com
  "Mostrar cancelados" ela volta riscada, com etiqueta, motivo ao passar o mouse e "Restaurar". `E2E`
- [ ] **Botão bloqueado**: em taxa paga o botão "Cancelar" fica desabilitado e explica por quê. `E2E`
- [ ] **Perfil morador**: não há "Mostrar cancelados" nem botões de ação nas listas. `E2E`

### 7.16 Resumo do mês por regime (competência e caixa)

> Cenários levantados em 02/10/2026 (item 2.2 do backlog). Regras na seção 4.4 de [`regras-de-negocio.md`](./regras-de-negocio.md).
> Os `API` têm teste em `test/restassured` (`RegimeDeCaixaApiTest`, compilado e ainda não executado).

- [ ] **Padrão**: sem `regime`, vale a competência e a resposta informa `regime`; `regime=caixa` informa `caixa`. `API`
- [ ] **Validação**: regime desconhecido retorna 400; sem ano ou mês continua 400. `API`
- [ ] **Os regimes diferem**: em um mês com atrasos pagos depois (ex.: 05/2023), as receitas de competência e de caixa são
  diferentes, e as despesas são iguais. `API`
- [ ] **Pagamento em outro mês**: pagar em março uma taxa de janeiro sobe a receita de janeiro na competência e a de março no
  caixa, e não mexe no caixa de janeiro nem na competência de março. `API`
- [ ] **Totais convergem**: de 2020 a 2026 a soma das receitas é a mesma nos dois regimes. `API` / `DB/Integridade`
- [ ] **Conferência no banco**: a competência de um mês é igual à soma das taxas pagas com aquele mês de referência mais as outras
  receitas; o caixa, à das taxas com data de pagamento naquele mês mais as outras receitas. `DB/Integridade`
- [ ] **Cancelados**: despesa ou receita cancelada sai dos dois regimes e volta ao restaurar. `API`
- [ ] **Acesso**: qualquer perfil logado consulta os dois regimes; sem token, 401. `API`
- [ ] **Seletor**: "Competência | Caixa" aparece no resumo do mês, nas telas do admin e do morador; trocar atualiza os cartões
  de receitas, despesas e saldo e a explicação ao lado, sem mudar o resumo por bloco nem as listas. `E2E`
- [ ] **Valor inicial**: a tela abre sempre em Competência. `E2E`

### 7.17 Tela única "Taxas do mês"

> Cenários levantados em 02/10/2026 (item 2.15 do backlog). Regras na seção 4.12 de [`regras-de-negocio.md`](./regras-de-negocio.md).
> Só interface (sem mudança de API); todos `E2E`, ainda sem teste automatizado, e a tela ainda não foi aberta em navegador.

- [ ] **Menu**: "Taxas do mês" aparece como item do menu principal do admin e não aparece para morador; Cadastro não tem mais
  "Taxas de condomínio". O endereço antigo `/admin/cadastro/taxas` redireciona para `/admin/taxas`, mantendo `ano`, `mes` e
  `apartamento_id`. `E2E`
- [ ] **Resumo do mês**: mostra geradas, adimplentes, a vencer e em atraso (quantidade e valor de cada grupo); "Canceladas"
  só aparece quando houver; trocar mês ou ano atualiza o resumo e a tabela. `E2E`
- [ ] **Resumo não depende do filtro**: com o filtro por apartamento ativo, o resumo continua sendo do mês inteiro. `E2E`
- [ ] **Resumo bate com a tabela**: a soma das linhas por situação é igual aos números do resumo. `E2E`
- [ ] **Gerar no mesmo lugar**: gerar as taxas do mês escolhido mostra a confirmação, e depois as linhas novas aparecem na tabela e
  o resumo sobe, sem trocar de tela. `E2E`
- [ ] **Registrar pagamento no mesmo lugar**: na linha de uma taxa em aberto, registrar o pagamento muda a situação para
  adimplente, atualiza o resumo (sai de "A vencer"/"Em atraso" e entra em "Adimplentes") e mostra o juros calculado. `E2E`
- [ ] **Cancelar e restaurar**: cancelar uma taxa a tira da tabela e do resumo (e conta em "Canceladas"); "Mostrar canceladas" a
  traz de volta riscada, e Restaurar a devolve; taxa paga tem o botão Cancelar desabilitado. `E2E`
- [ ] **Filtro por apartamento**: abrir pelo mês em atraso de Dados dos Moradores mostra só aquele apartamento, com o aviso e o botão
  "Ver todos os apartamentos". `E2E`
- [ ] **Lançar taxa individual**: a seção recolhida abre, vem com o valor padrão do ano, e uma taxa lançada aparece na tabela do
  mês correspondente (se for o mês aberto). `E2E`
- [ ] **Visualizar → Financeiro**: não tem mais a tabela de taxas; tem o atalho "Abrir Taxas de MM/AAAA" que leva à tela nova no
  mesmo mês e ano. As listas de despesas e outras receitas e o resumo por bloco continuam. `E2E`
- [ ] **Mês sem taxas**: a tabela mostra "Nenhuma taxa neste mês" e o resumo mostra zeros, sem erro. `E2E`
- [ ] **Ajuda**: o tour de Taxas do mês e o guia "Gerar as taxas do mês e registrar os pagamentos" descrevem a tela nova. `E2E` / revisão manual

## 8. Sugestão de Uso com IA (Playwright + IA)

- Gerar variações automáticas dos casos de "Validação de Formulários" e "Estados Vazios" via prompt
  de IA a partir da tabela de campos em `regras-de-negocio.md` (boa forma de exercitar geração de
  casos de teste combinatórios: campo × tipo de valor inválido).
- Usar os casos de "Integridade de Dados" e "RBAC" como candidatos a testes de API/contrato,
  rodados no pipeline de CI antes dos testes E2E (mais rápidos, detectam regressão de regra de
  negócio sem precisar subir UI).
