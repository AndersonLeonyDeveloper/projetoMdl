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

### 7.4 Comprovantes (upload e visualização)

> Cenários levantados em 02/10/2026, ao implementar o item 3.4 de [`melhorias-e-ideias.md`](./melhorias-e-ideias.md).
> Regras em [`regras-de-negocio.md`](./regras-de-negocio.md), seção 6. Os marcados `API` já têm teste em
> `test/restassured` (`ComprovantesApiTest`), mas ainda não foram executados.
> Pré-requisito: `npm run db:seed && npm run db:seed:financeiro`.

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
- [ ] **Link em todas as telas**: tabela de taxas (admin) e listas de receitas/despesas nas telas de Financeiro dos
  dois perfis. `E2E`
- [ ] **Sessão expirada** ao abrir o comprovante redireciona para o login e não deixa aba em branco aberta. `E2E`

**Dados de demonstração**
- [ ] **Exemplos gerados**: após `db:seed:financeiro` existem os 12 arquivos `exemplo-*` e todos abrem (200). `API`
- [ ] **Distribuição**: taxas em aberto não têm comprovante; parte das taxas pagas, receitas e despesas têm. `API`
- [ ] **Reset**: `db:reset` apaga a pasta de comprovantes, e os lançamentos novos voltam a funcionar. `DB/Integridade`

### 7.5 Edição de lançamentos, configurações financeiras, taxas em lote e juros

> Cenários levantados em 02/10/2026. Regras em [`regras-de-negocio.md`](./regras-de-negocio.md), seções 4.1.1 e 4.6 a 4.8
> (itens 2.8 a 2.11 do backlog). Pré-requisito: `npm run db:seed && npm run db:seed:financeiro`.
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
- [ ] **Interface — localização**: a geração fica em Cadastro → Taxas de condomínio (e não em Receitas / Despesas, que
  fica só com Outras Receitas e Despesas). `E2E`
- [ ] **Interface — valor do ano editável**: o campo vem preenchido com o padrão do ano e muda ao trocar o ano. Em ano sem
  valor vem vazio e o botão fica desabilitado até informar um valor. `E2E`
- [ ] **Interface — salva o padrão**: gerar com um valor diferente do configurado atualiza o padrão do ano
  (Configurações financeiras e o campo "Valor" do lançamento individual passam a mostrá-lo) e não altera taxas já
  lançadas. `E2E`
- [ ] **Interface — confirmação**: o diálogo informa quantidade, valor, mês e ignoradas; cancelar não cria nada; mês já
  totalmente gerado mostra "nada a gerar" sem diálogo. `E2E`
- [ ] **Interface — resultado**: informa quantas taxas foram criadas e quantas ignoradas, e o link "Ver taxas do mês"
  abre Visualizar → Financeiro já no mês e ano gerados, com a tabela de taxas e o total inadimplente. `E2E`

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

## 8. Sugestão de Uso com IA (Playwright + IA)

- Gerar variações automáticas dos casos de "Validação de Formulários" e "Estados Vazios" via prompt
  de IA a partir da tabela de campos em `regras-de-negocio.md` (boa forma de exercitar geração de
  casos de teste combinatórios: campo × tipo de valor inválido).
- Usar os casos de "Integridade de Dados" e "RBAC" como candidatos a testes de API/contrato,
  rodados no pipeline de CI antes dos testes E2E (mais rápidos, detectam regressão de regra de
  negócio sem precisar subir UI).
