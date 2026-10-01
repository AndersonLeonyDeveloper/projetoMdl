# Dados de demonstração — Morada da Lagoa

Este documento explica como o banco do sistema é populado com dados fictícios para demonstração, por que cada escolha foi feita e o que cada script faz. Todos os nomes, e-mails, CPFs e valores são **inventados**. Nenhum dado real é usado.

## 1. Visão geral

O condomínio fictício "Morada da Lagoa" tem **12 blocos**, cada um com **16 apartamentos**, num total de **192 unidades**. O banco guarda três grupos de informação, e cada um é carregado por um comando próprio:

| Comando | O que carrega | Quando usar |
|---|---|---|
| (automático ao iniciar o servidor) | Estrutura: blocos 01–12 e seus apartamentos | Nunca precisa rodar à mão |
| `npm run db:seed:moradores` | 192 proprietários e 576 inquilinos | Para ter o cadastro completo de moradores |
| `npm run db:seed:financeiro` | Taxas, receitas e despesas de jan/2020 a set/2026 | Para ter o histórico financeiro |
| `npm run db:reset` | Zera moradores e financeiro, mantém a estrutura e o administrador | Para recomeçar do zero |

Ordem sugerida para uma demonstração completa:

```
npm run db:reset
npm run db:seed:moradores
npm run db:seed:financeiro
```

Os dois scripts de carga podem ser repetidos quantas vezes for preciso. Eles apagam o que já carregaram e recriam tudo com o mesmo resultado, porque usam uma semente fixa de sorteio. Quem rodar duas vezes verá os mesmos nomes, valores e datas.

O comando antigo `npm run db:seed` continua existindo, com um conjunto pequeno de 7 moradores de exemplo usado nos testes automatizados. Ele **não deve ser misturado** com os dois novos, porque também apaga e recria moradores.

## 2. O que mudou no sistema

### 2.1 Blocos e apartamentos agora são uma estrutura fixa

Antes, o `db:reset` apagava blocos e apartamentos, e a tela de cadastro de morador ficava com as listas vazias. Agora a estrutura do condomínio existe sempre:

- Blocos de **01 a 12**.
- Em cada bloco, **16 apartamentos**: `01, 02, 03, 04, 101–104, 201–204, 301–304`.
- A estrutura é criada automaticamente quando o servidor sobe e nunca é apagada pelo reset.
- O cadastro de morador apenas **vincula** uma pessoa a um apartamento que já existe.

### 2.2 Um apartamento pode ter vários inquilinos

A regra antiga permitia só 1 proprietário e 1 inquilino ativos por apartamento. A nova regra reflete a realidade de quem aluga para mais de uma pessoa:

- **1 proprietário ativo** por apartamento (continua valendo).
- **Vários inquilinos ativos** ao mesmo tempo, sem limite.
- Trocar um inquilino desativa só o vínculo dele; o histórico fica preservado.

A mudança foi feita no banco (índice `idx_proprietario_ativo_unico`), na mensagem de erro do cadastro e nos documentos `regras-de-negocio.md`, `modelagem-dados.md` e `sugestoes-de-testes.md`. Bancos criados antes da mudança são ajustados sozinhos na próxima inicialização.

## 3. Script de moradores — `db:seed:moradores`

Arquivos: `app/server/src/db/seed-moradores.js` e `app/server/src/db/fake-data.js`.

O que faz:

- Apaga os moradores existentes, as pessoas e os usuários que não são administradores. Não mexe em blocos, apartamentos, no administrador nem no financeiro.
- Cria, para cada um dos 192 apartamentos, **1 proprietário e 3 inquilinos**, todos ativos. São **768 pessoas**.
- Gera nomes americanos compostos, como "Sophia Perez" e "Caleb Green". Nenhum nome se repete, e os e-mails (`nome.sobrenome@example.com`) também são todos distintos.
- Gera telefones no formato `(85) 9XXXX-XXXX`. Os proprietários recebem CPF com dígitos verificadores válidos, e os inquilinos ficam sem CPF, como a regra de negócio permite.
- Não cria logins de acesso para esses moradores. Eles aparecem apenas no cadastro.

## 4. Script financeiro — `db:seed:financeiro`

Arquivo: `app/server/src/db/seed-financeiro.js`.

O objetivo é que o histórico seja **crível para quem conhece condomínio**. Por isso ele não é uma sequência de valores aleatórios. Ele simula as situações que um síndico enfrenta ao longo de anos. Os parâmetros ficam no topo do arquivo e podem ser ajustados.

O script apaga as taxas, receitas e despesas existentes e gera **81 meses (jan/2020 a set/2026)** para as 192 unidades: cerca de **15,5 mil taxas**, **650 receitas** e **785 despesas**.

### 4.1 Taxa de condomínio

Todas as unidades pagam o mesmo valor, reajustado em janeiro de cada ano, em linha com a inflação e como seria votado em assembleia:

| Ano | Taxa mensal |
|---|---|
| 2020 | R$ 230 |
| 2021 | R$ 240 (quase congelada, por causa da pandemia) |
| 2022 | R$ 265 |
| 2023 | R$ 280 |
| 2024 | R$ 295 |
| 2025 | R$ 310 |
| 2026 | R$ 325 |

O vencimento é no dia 10. Pagamento depois disso gera **multa de 2% mais juros de 1% ao mês** (proporcional aos dias de atraso), que é o padrão do Código Civil (art. 1.336, §1º) para condomínios.

### 4.2 Inadimplência

A inadimplência é o ponto central da demonstração, e segue o que acontece na prática:

- **Nível normal:** 5% a 9% das unidades atrasam, faixa comum em condomínios brasileiros.
- **Sazonalidade:** sobe em janeiro (IPTU, IPVA, material escolar), um pouco em fevereiro, e cai em dezembro (13º salário).
- **Pandemia (2020):** a taxa de atraso sobe a partir de abril e chega a cerca de 14% em junho e julho.
- **Cobrança jurídica (outubro/2022):** a contratação de assessoria jurídica reduz a inadimplência de cerca de 8,5% (2022) para ~6% (2023), ~5% (2024) e ~4,5% (2025).
- **Perfis de pagador:** a maior parte dos apartamentos paga em dia. Alguns atrasam de vez em quando, outros atrasam com frequência. Um grupo pequeno (6 unidades) são devedores crônicos.
- **Como o atraso termina:** parte paga no mesmo mês, depois do vencimento. Outros pagam em 1 a 6 meses, com juros. Alguns fazem acordo tardio. Os devedores crônicos ficam de 5 a 14 meses sem pagar e encerram com um acordo, com os meses pagos numa mesma data e juros altos.
- **Dívidas em aberto hoje:** três devedores crônicos estão sem pagar há 11, 7 e 5 meses. Há também um caso antigo em cobrança judicial e uma parcela das dívidas da pandemia que nunca foi regularizada. No total, **89 taxas** estão em aberto (cerca de 0,6% do histórico).
- **Aparência dos dados:** meses recentes mostram mais inadimplência, porque a dívida ainda não foi regularizada. Meses antigos mostram só os casos que não foram quitados. É assim que um relatório de cobrança real se comporta.

### 4.3 Despesas

As despesas mensais seguem a proporção típica de um condomínio, calculada sobre o faturamento (taxa × 192 unidades):

| Item | Peso aproximado |
|---|---|
| Folha de pagamento e encargos (portaria, zeladoria, limpeza) | 51% |
| Água e esgoto | 11,5% |
| Manutenção geral | 7,5% |
| Energia das áreas comuns | 5,5% |
| Material de limpeza e jardinagem | 4% |
| Administradora e contabilidade | 3% |
| Portaria remota e CFTV | 3% |
| Despesas diversas | 1,5% |
| Honorários advocatícios | 0,6% (1,4% depois da cobrança jurídica) |

Há variações realistas: água mais cara no verão, energia maior de outubro a março, aumento da folha em novembro e dezembro (13º), e **bandeira tarifária vermelha em 2021**, que encareceu a energia na segunda metade do ano. Cada mês varia em torno de ±6%.

Itens periódicos: dedetização (março e setembro), limpeza das caixas d'água (junho e dezembro), extintores e hidrantes (outubro) e seguro predial anual (março).

Os blocos têm 4 pavimentos, então **não há despesas de elevador**.

Eventos de obra e emergência, que criam as variações mais visíveis:

| Quando | Evento | Valor aproximado |
|---|---|---|
| mar–jul/2020 | Álcool em gel, EPIs e sanitização (pandemia) | R$ 1,8 mil/mês |
| mar–mai/2022 | Instalação de CFTV, em 3 parcelas | R$ 38 mil |
| fev–mai/2023 | Pintura dos 12 blocos, em 4 parcelas | R$ 140 mil |
| jun/2024 | Troca de bombas e reforma do reservatório | R$ 18 mil |
| mar/2025 | Impermeabilização do telhado dos blocos 03 e 07 | R$ 22 mil |
| out/2025 | Reforma da quadra | R$ 24 mil |
| abr/2026 | Renovação do AVCB e recarga de extintores | R$ 6 mil |

### 4.4 Outras receitas

- Aluguel do salão de festas: de 2 a 6 eventos por mês (mais em julho e dezembro), com preço entre R$ 150 e R$ 250 conforme o ano. O salão fica **fechado de abril a agosto de 2020** e quase sem uso até o fim do ano.
- Rendimentos do fundo de reserva (CDB), de cerca de 1,2% a 1,8% do faturamento mensal.
- Multas por infração ao regimento interno e taxas de mudança.
- Venda de material reciclável.
- Festa junina (junho) e bingo de fim de ano (dezembro), exceto em 2020.

### 4.5 O que a demonstração mostra

Resumo anual gerado pelo script (valores em reais):

| Ano | Faturamento | Atraso no vencimento | Em aberto hoje | Receitas | Despesas | Saldo |
|---|---|---|---|---|---|---|
| 2020 | 529.920 | 10,9% | 1,6% | 540.685 | 497.824 | +42.861 |
| 2021 | 552.960 | 9,1% | 0,0% | 584.766 | 518.877 | +65.890 |
| 2022 | 610.560 | 8,4% | 0,1% | 643.589 | 602.312 | +41.277 |
| 2023 | 645.120 | 6,2% | 0,4% | 680.272 | 771.841 | **−91.569** |
| 2024 | 679.680 | 5,2% | 0,0% | 720.393 | 650.662 | +69.730 |
| 2025 | 714.240 | 4,7% | 0,3% | 756.112 | 735.045 | +21.066 |
| 2026 (até set) | 561.600 | 5,3% | 1,9% | 581.349 | 540.631 | +40.718 |

Pontos para a conversa:

1. **Pandemia (2020):** o atraso chega a 14% e o saldo de alguns meses cai perto de zero.
2. **Cobrança jurídica (2022):** a inadimplência cai de ~8,4% para 5% em dois anos, e é uma boa medida do efeito de uma ação de gestão.
3. **Obra da pintura (2023):** o saldo mensal fica entre −R$ 34 mil e −R$ 45 mil de fevereiro a maio e o ano fecha negativo. Na prática, é o fundo de reserva sendo usado.
4. **Devedores crônicos:** hoje há unidades com 5, 7 e 11 meses sem pagar, o que permite mostrar o drill-down de inadimplência até o apartamento.
5. **Sazonalidade:** janeiro e março (seguro) são meses mais apertados, e dezembro tem as despesas de 13º.

## 5. Limites desta simulação

- O **fundo de reserva** não existe como tabela: está embutido na taxa, e seu efeito aparece no saldo de cada ano.
- Os registros **não têm comprovante** anexado, porque não existem arquivos reais.
- O saldo mensal do sistema é calculado por **mês de referência da taxa**, e não pela data em que o dinheiro entrou. Por isso, um atraso que depois foi pago aparece como receita do mês original.
- A tela **Visualizar → Evolução** mostra 2020 a 2026 de uma só vez: receitas × despesas, inadimplência e resumo anual. As telas Financeiro e Taxa de Inadimplência continuam mostrando um mês ou um ano por vez.
- Os números foram escolhidos para ser **plausíveis**, não são dados de um condomínio real. Os percentuais de referência (inadimplência de 5% a 10%, folha como maior despesa, multa de 2% e juros de 1% ao mês) são práticas comuns do mercado, e não vêm de uma pesquisa específica citada aqui.
