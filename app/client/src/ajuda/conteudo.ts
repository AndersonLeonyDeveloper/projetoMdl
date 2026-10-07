// Conteúdo da ajuda guiada. São dados puros: para mudar um texto ou um passo, só este arquivo muda.
// Os alvos do tour são valores de data-testid das telas (ver pages/**). Alvo ausente: o passo aparece centralizado.
// Quando uma tela mudar, revise o conteúdo correspondente aqui (ver regras-de-negocio.md, seção 8).

export interface PassoTour {
  titulo: string;
  descricao: string;
  alvo?: string; // data-testid do elemento a destacar
}

export interface AjudaDaTela {
  resumo: string;
  passos: PassoTour[];
}

export interface PassoGuia {
  texto: string;
  rota?: string; // quando existe, o passo ganha o botão "Ir para a tela"
}

export interface Guia {
  id: string;
  titulo: string;
  descricao: string;
  passos: PassoGuia[];
}

export const AJUDA_POR_ROTA: Record<string, AjudaDaTela> = {
  // ---------- Admin ----------
  '/admin/cadastro/moradores': {
    resumo:
      'Cadastra proprietários e inquilinos em {u.p}. Cada {u.s} tem no máximo 1 proprietário ativo e pode ter vários inquilinos.',
    passos: [
      { titulo: 'Menu', descricao: 'Use o menu para trocar de tela. Cadastro reúne tudo o que você lança no sistema.', alvo: 'menu-principal' },
      { titulo: 'Local do morador', descricao: 'Escolha {a.o} {a.s}, {u.o} {u.s} e se a pessoa é proprietária ou inquilina.', alvo: 'select-bloco' },
      { titulo: 'Dados pessoais', descricao: 'Informe nome, CPF, telefone e e-mail. O e-mail precisa ser confirmado.', alvo: 'input-nome' },
      { titulo: 'Salvar', descricao: 'Clique em Salvar. Uma mensagem confirma o cadastro ou explica o que precisa ser corrigido.', alvo: 'botao-salvar-morador' },
    ],
  },
  '/admin/taxas': {
    resumo:
      'Reúne o ciclo da taxa de condomínio de um mês: o resumo, gerar as taxas, registrar os pagamentos, editar, cancelar e lançar uma taxa avulsa.',
    passos: [
      { titulo: 'Mês e ano', descricao: 'Escolha o mês que quer trabalhar. O resumo, a geração e a tabela passam a ser desse mês.', alvo: 'input-ano' },
      { titulo: 'Resumo do mês', descricao: 'Quantas taxas foram geradas e quantas estão adimplentes, a vencer ou em atraso, com o valor de cada grupo.', alvo: 'resumo-taxas-do-mes' },
      { titulo: 'Gerar taxas', descricao: 'Cria a taxa de cada {u.s} que ainda não tem uma no mês. O valor vem do padrão do ano; se mudar, ele passa a ser o novo padrão. O sistema mostra quantas serão criadas e pede confirmação.', alvo: 'gerar-taxas-mes' },
      { titulo: 'Taxas do mês', descricao: 'Cada linha é {u.um} {u.s}. Em "Registrar pagamento", informe a data: o sistema calcula multa e juros se houve atraso, e você pode ajustar o valor. Nas pagas, o botão é Editar. Se você chegou por um mês em atraso de Dados dos Moradores, a tabela mostra só {u.o} {u.s} em questão.', alvo: 'tabela-taxas' },
      { titulo: 'Taxas em acordo', descricao: 'Uma taxa incluída em um acordo aparece como "Em acordo" (ou "Quitada por acordo") e é paga pelas parcelas, na tela Acordos. Não dá para pagar, editar nem cancelar a taxa direto enquanto o acordo vale.', alvo: 'tabela-taxas' },
      { titulo: 'Cancelar uma taxa', descricao: 'Para uma taxa gerada por engano use Cancelar, com o motivo. Ela sai dos totais, mas pode ser restaurada com "Mostrar canceladas". Taxa paga só cancela depois de remover o pagamento.', alvo: 'switch-mostrar-canceladas' },
      { titulo: 'Lançar taxa avulsa', descricao: 'Para uma taxa fora da geração em lote (por exemplo, com valor diferente), abra esta seção e informe {a.s}, {u.s}, mês, ano e valor.', alvo: 'lancar-taxa-individual' },
    ],
  },
  '/admin/cadastro/financeiro': {
    resumo: 'Lança outras receitas (aluguel do salão, multas, eventos) e despesas do condomínio, com comprovante opcional.',
    passos: [
      { titulo: 'Escolha o tipo', descricao: 'Use as abas para lançar uma outra receita ou uma despesa. As taxas de condomínio ficam em Taxas do mês.', alvo: 'tabs-cadastro-financeiro' },
      { titulo: 'Descrição, valor e data', descricao: 'Preencha o que foi, quanto e quando. O valor não pode ser negativo.' },
      { titulo: 'Paga pelo fundo de reserva', descricao: 'Em Despesas, marque "Paga pelo fundo de reserva" para uma obra paga com o fundo: ela é descontada do saldo do fundo (Visualizar → Fundo de reserva).', alvo: 'tabs-cadastro-financeiro' },
      { titulo: 'Despesa por {a.s}', descricao: 'Em Despesas, o campo {a.S} é opcional: sem {a.s}, a despesa é geral e se divide por igual entre {a.p}; com {a.s}, vale só para {a.esse} {a.s} (ex.: reparo da cobertura {a.do} {a.s} 07).', alvo: 'tabs-cadastro-financeiro' },
      { titulo: 'Comprovante (opcional)', descricao: 'Anexe um PDF, JPEG ou PNG de até 5 MB. Depois de salvar, ele pode ser aberto pelo link "Ver comprovante".' },
    ],
  },
  '/admin/cadastro/configuracoes': {
    resumo:
      'Define o valor da taxa de cada ano e as regras de atraso (multa, juros ao mês e dia de vencimento). Mudanças não alteram lançamentos já feitos.',
    passos: [
      { titulo: 'Multa, juros e vencimento', descricao: 'A multa vai até 2%. O juros é ao mês, proporcional aos dias de atraso. Salve para valer nos próximos pagamentos.', alvo: 'form-parametros-financeiros' },
      { titulo: 'Valor da taxa por ano', descricao: 'Edite o valor de um ano e clique em Salvar na linha. Esse valor já vem preenchido ao lançar e gerar taxas.', alvo: 'tabela-taxas-padrao' },
      { titulo: 'Novo ano', descricao: 'Para um ano que ainda não está na lista, informe o ano e o valor aqui.', alvo: 'form-nova-taxa-ano' },
      { titulo: 'Fator por {u.s}', descricao: 'Cada {u.s} tem um fator (1,00 = valor do ano; ex.: 1,20 para uma cobertura) que multiplica o valor da taxa ao gerar o mês. Escolha {a.o} {a.s}, ajuste o fator de cada {u.s} ou aplique o mesmo fator ao conjunto ({u.p} {a.do} {a.s}). Taxas já geradas não mudam.', alvo: 'fator-por-apartamento' },
    ],
  },
  '/admin/cadastro/nomes': {
    resumo:
      'Define como o condomínio chama {a.p} e {u.p} (ex.: Bloco/Apartamento, Torre/Casa). Só muda o que aparece nas telas, na ajuda e no histórico; os números cadastrados continuam os mesmos.',
    passos: [
      { titulo: 'Nome do condomínio', descricao: 'Aparece no topo do menu lateral.', alvo: 'input-nome-condominio' },
      { titulo: 'Nome de {a.s}', descricao: 'Informe singular, plural e a abreviação usada nos rótulos curtos (ex.: Bl.08/Ap.203). O gênero acerta artigos como "o bloco" e "a torre".', alvo: 'input-agrupador-singular' },
      { titulo: 'Salvar', descricao: 'Clique em Salvar nomes. Um registro é gravado no Histórico de alterações.', alvo: 'botao-salvar-nomes' },
    ],
  },
  '/admin/visualizar/financeiro': {
    resumo:
      'Mostra o financeiro de um mês: resumo, resumo por {a.s}, despesas e outras receitas. A lista de taxas e o registro de pagamentos ficam em Taxas do mês.',
    passos: [
      { titulo: 'Período', descricao: 'Escolha o ano e o mês que quer consultar.', alvo: 'input-ano' },
      { titulo: 'Regime: competência ou caixa', descricao: 'Competência conta a taxa no mês a que ela se refere; Caixa conta no mês em que foi paga. Isso muda as receitas e o saldo do mês (despesas e outras receitas não mudam).', alvo: 'segmented-regime' },
      { titulo: 'Resumo do mês', descricao: 'Receitas, despesas e saldo do mês escolhido, no regime selecionado.', alvo: 'resumo-mensal' },
      { titulo: 'Resumo por {a.s}', descricao: 'Saldo de cada {a.s} = receitas {a.do} {a.s} menos as despesas {a.do} {a.s} (as próprias e a parte das despesas gerais, divididas por igual). As taxas em aberto aparecem nas colunas Inadimplente e A vencer, fora do saldo.', alvo: 'tabela-resumo-blocos' },
      { titulo: 'Taxas do mês', descricao: 'Este atalho abre a tela Taxas do mês já no mês e ano escolhidos, onde ficam a geração, o registro de pagamentos, a edição e o cancelamento das taxas.', alvo: 'atalho-taxas-do-mes' },
      { titulo: 'Outras receitas e despesas', descricao: 'Estas listas têm o botão Editar para corrigir um lançamento, o Cancelar (com motivo; some dos totais e pode ser restaurado com "Mostrar cancelados") e o link para ver o comprovante.', alvo: 'tabela-despesas' },
    ],
  },
  '/admin/visualizar/evolucao': {
    resumo: 'Mostra a evolução de receitas, despesas e inadimplência ao longo dos anos.',
    passos: [
      { titulo: 'Período', descricao: 'Escolha o ano inicial e o final.', alvo: 'input-ano-inicio' },
      { titulo: 'Visão', descricao: 'Alterne entre Mensal e Anual.', alvo: 'segmented-visao' },
      { titulo: 'Últimos 12 meses', descricao: 'Os cartões resumem o período mais recente.', alvo: 'cartoes-evolucao' },
      { titulo: 'Tabela', descricao: 'Os mesmos números dos gráficos, em tabela.', alvo: 'tabela-evolucao' },
    ],
  },
  '/admin/visualizar/moradores': {
    resumo:
      'Lista os moradores cadastrados, com {a.s}, {u.s} e tipo. Nas linhas de proprietário, a coluna Mensalidades mostra se a taxa está em dia ou quantas estão em atraso. Um aviso no topo lista quais {u.p} estão sem proprietário.',
    passos: [
      { titulo: 'Lista de moradores', descricao: 'Use os filtros e a paginação da tabela para localizar uma pessoa.', alvo: 'tabela-visualizar-moradores' },
      { titulo: '{u.P} sem proprietário', descricao: 'Quando {u.o} {u.s} fica sem proprietário (sem moradores ou só com inquilinos), um aviso amarelo aparece no topo, com o botão "Mostrar apenas esses". Nesses casos, a coluna Mensalidades mostra "Sem proprietário" (e o atraso, se houver).', alvo: 'tabela-visualizar-moradores' },
      { titulo: 'Mensalidades', descricao: 'Taxas incluídas em um acordo ativo aparecem como "N em acordo" e não contam como atraso. Só o proprietário tem esta coluna: "Em dia" ou "N em atraso". Clique em "N em atraso" para ver cada mensalidade vencida com valor, juros até hoje e total, mais o total devido. Clique em um mês para abrir a taxa em Taxas do mês. Dá para filtrar por Em atraso e Em dia.', alvo: 'tabela-visualizar-moradores' },
    ],
  },
  '/admin/visualizar/inadimplencia': {
    resumo: 'Consolida a inadimplência de um ano, mês a mês.',
    passos: [
      { titulo: 'Ano', descricao: 'Escolha o ano a consultar.', alvo: 'input-ano' },
      { titulo: 'Inadimplência por mês', descricao: 'Valores adimplentes e inadimplentes de cada mês do ano.', alvo: 'tabela-inadimplencia' },
    ],
  },

  '/admin/acordos': {
    resumo:
      'Renegocia taxas em atraso de {u.um} {u.s} em parcelas. Enquanto o acordo está ativo ou quitado, as taxas deixam de contar como atraso, e o dinheiro entra como receita quando cada parcela é paga.',
    passos: [
      { titulo: 'Novo acordo', descricao: 'Escolha {u.o} {u.s}, marque as taxas em atraso que entram, informe o número de parcelas, o primeiro vencimento, a entrada e um desconto (opcional). O sistema mostra o total e as parcelas antes de criar.', alvo: 'botao-novo-acordo' },
      { titulo: 'Lista de acordos', descricao: 'Mostra a situação (Ativo, Quitado, Descumprido ou Cancelado), o total, o que já foi recebido e o próximo vencimento. Clique em "Ver detalhes" para registrar pagamentos de parcelas ou cancelar.', alvo: 'tabela-acordos' },
      { titulo: 'Descumprimento', descricao: 'Uma parcela vencida há mais de 5 dias sem pagamento torna o acordo descumprido, e as taxas voltam a contar como atraso. Registrar o pagamento da parcela atrasada retoma o acordo.', alvo: 'filtro-status-acordo' },
    ],
  },
  '/admin/visualizar/fundo': {
    resumo:
      'Mostra o saldo do fundo de reserva: o que entrou (uma parte de cada taxa paga) e o que saiu (obras e despesas marcadas como pagas pelo fundo).',
    passos: [
      { titulo: 'Saldo e totais', descricao: 'Saldo atual, saldo inicial, total de aportes e total de retiradas do fundo.', alvo: 'cartoes-fundo' },
      { titulo: 'Percentual por ano', descricao: 'O percentual da taxa que vira aporte é definido por ano em Cadastro → Configurações financeiras.', alvo: 'percentuais-fundo' },
      { titulo: 'Obras pagas com o fundo', descricao: 'As despesas marcadas como "Paga pelo fundo de reserva" no cadastro de despesas aparecem aqui e saem do saldo.', alvo: 'tabela-obras-fundo' },
      { titulo: 'Por ano e por mês', descricao: 'O resumo por ano e o movimento mês a mês mostram aportes, retiradas e o saldo acumulado.', alvo: 'tabela-fundo-ano' },
    ],
  },
  '/admin/visualizar/historico': {
    resumo:
      'Mostra quem alterou o quê nos dados financeiros (taxas, despesas, outras receitas e configurações), com o valor de antes e de depois. O registro não pode ser editado nem apagado.',
    passos: [
      { titulo: 'Filtros', descricao: 'Filtre por tipo (taxa, despesa, outra receita, configuração), ação, período e usuário.', alvo: 'filtro-entidade' },
      { titulo: 'Lista de alterações', descricao: 'Cada linha é uma alteração, da mais recente para a mais antiga. Clique na seta para ver o que mudou, campo a campo (antes → depois).', alvo: 'tabela-historico' },
    ],
  },

  // ---------- Moradores ----------
  '/minha-area/fundo-reserva': {
    resumo: 'Mostra o saldo do fundo de reserva do condomínio e as obras pagas com ele.',
    passos: [
      { titulo: 'Saldo do fundo', descricao: 'Quanto o fundo tem hoje, quanto já entrou e quanto já saiu.', alvo: 'cartoes-fundo' },
      { titulo: 'Obras pagas com o fundo', descricao: 'As obras e despesas que foram pagas com o fundo de reserva.', alvo: 'tabela-obras-fundo' },
      { titulo: 'Por ano e por mês', descricao: 'A evolução do fundo ao longo do tempo.', alvo: 'tabela-fundo-ano' },
    ],
  },
  '/minha-area/apartamentos': {
    resumo: 'Mostra {u.p} que estão na sua conta.',
    passos: [
      { titulo: '{u.P} da sua conta', descricao: 'Cada item é {u.um} {u.s} da sua conta, com {a.s} e número. Se a lista estiver vazia, procure a administração.', alvo: 'lista-meus-apartamentos' },
    ],
  },
  '/minha-area/dados': {
    resumo: 'Permite atualizar seus dados de contato.',
    passos: [
      { titulo: 'Seus dados', descricao: 'Corrija nome, telefone ou e-mail. Ao mudar o e-mail, repita-o no campo de confirmação.', alvo: 'form-meus-dados' },
      { titulo: 'Salvar', descricao: 'Clique em Salvar. Uma mensagem confirma a alteração.', alvo: 'botao-salvar-meus-dados' },
    ],
  },
  '/minha-area/financeiro': {
    resumo: 'Mostra o financeiro do condomínio em modo leitura: receitas, despesas, saldo e comprovantes.',
    passos: [
      { titulo: 'Período', descricao: 'Escolha o ano e o mês que quer consultar.', alvo: 'input-ano' },
      { titulo: 'Regime: competência ou caixa', descricao: 'Competência conta a taxa no mês a que ela se refere; Caixa conta no mês em que foi paga. Escolha como quer ler as receitas do mês.', alvo: 'segmented-regime' },
      { titulo: 'Resumo do mês', descricao: 'Receitas, despesas e saldo do condomínio no mês, no regime selecionado.', alvo: 'resumo-mensal' },
      { titulo: 'Resumo por {a.s}', descricao: 'Quanto cada {a.s} tem em dia e em aberto.', alvo: 'tabela-resumo-blocos' },
      { titulo: 'Comprovantes', descricao: 'Nas listas de outras receitas e despesas, "Ver comprovante" abre o arquivo em uma nova aba.', alvo: 'tabela-despesas' },
      { titulo: 'Evolução do condomínio', descricao: 'No fim da tela, os gráficos mostram receitas, despesas e saldo ao longo dos anos (mensal ou anual). É um resumo do condomínio, sem dados de cada morador.', alvo: 'evolucao-do-condominio' },
    ],
  },
};

export const GUIAS: Record<'admin' | 'morador', Guia[]> = {
  admin: [
    {
      id: 'cadastrar-morador',
      titulo: 'Cadastrar um morador',
      descricao: 'Para incluir um proprietário ou inquilino em {u.um} {u.s}.',
      passos: [
        { texto: 'Abra Cadastro → Moradores.', rota: '/admin/cadastro/moradores' },
        { texto: 'Escolha {a.o} {a.s}, {u.o} {u.s} e o tipo (proprietário ou inquilino).' },
        { texto: 'Preencha nome, CPF, telefone e e-mail (e confirme o e-mail).' },
        { texto: 'Clique em Salvar.' },
      ],
    },
    {
      id: 'taxas-do-mes',
      titulo: 'Gerar as taxas do mês e registrar os pagamentos',
      descricao: 'O ciclo completo da taxa de condomínio, do valor ao pagamento.',
      passos: [
        { texto: 'Confira o valor da taxa do ano, a multa, o juros e o vencimento em Cadastro → Configurações financeiras.', rota: '/admin/cadastro/configuracoes' },
        { texto: 'Abra Taxas do mês e escolha o mês e o ano. O resumo mostra quantas taxas já existem.', rota: '/admin/taxas' },
        { texto: 'Em "Gerar taxas", confira o valor e clique em Gerar taxas. Confirme a quantidade.' },
        { texto: 'Conforme os moradores pagam, clique em "Registrar pagamento" na linha {u.do} {u.s}, na mesma tela. Informe a data (multa e juros são calculados se houve atraso), anexe o comprovante se houver e salve.' },
      ],
    },
    {
      id: 'lancar-despesa-receita',
      titulo: 'Lançar uma despesa ou outra receita',
      descricao: 'Para registrar o que o condomínio pagou ou recebeu fora da taxa.',
      passos: [
        { texto: 'Abra Cadastro → Receitas / Despesas.', rota: '/admin/cadastro/financeiro' },
        { texto: 'Escolha a aba Despesas ou Outras Receitas.' },
        { texto: 'Preencha descrição, valor e data. Se tiver o documento, anexe o comprovante (PDF, JPEG ou PNG de até 5 MB).' },
        { texto: 'Clique em Salvar.' },
      ],
    },
    {
      id: 'corrigir-lancamento',
      titulo: 'Corrigir um lançamento digitado errado',
      descricao: 'Vale para taxas, despesas e outras receitas.',
      passos: [
        { texto: 'Taxa: abra Taxas do mês, escolha o mês e clique em Editar (ou Registrar pagamento) na linha.', rota: '/admin/taxas' },
        { texto: 'Despesa ou receita: abra Visualizar → Financeiro, escolha o mês e clique em Editar na lista, mais abaixo na página.', rota: '/admin/visualizar/financeiro' },
        { texto: 'Corrija os campos. Para o comprovante, você pode manter, substituir ou remover.' },
        { texto: 'Clique em Salvar. Os resumos do mês já mostram o novo valor.' },
        { texto: 'Se o lançamento nem deveria existir (duplicado, troca de {u.s}), use Cancelar e informe o motivo: ele sai dos totais, mas pode ser restaurado. Taxa já paga só cancela depois de remover o pagamento.' },
      ],
    },
    {
      id: 'configurar-taxa',
      titulo: 'Configurar o valor da taxa, a multa e o juros',
      descricao: 'Para o reajuste anual ou para mudar as regras de atraso.',
      passos: [
        { texto: 'Abra Cadastro → Configurações financeiras.', rota: '/admin/cadastro/configuracoes' },
        { texto: 'Em "Multa, juros e vencimento", ajuste os percentuais (multa até 2%) e o dia de vencimento, e clique em Salvar parâmetros.' },
        { texto: 'Em "Valor da taxa por ano", edite o valor do ano e clique em Salvar na linha, ou adicione um ano novo.' },
        { texto: 'Lembre: taxas e pagamentos já lançados não mudam.' },
      ],
    },
    {
      id: 'acordo-de-divida',
      titulo: 'Fazer um acordo de dívida (parcelamento)',
      descricao: 'Para renegociar taxas em atraso de {u.um} {u.s} em parcelas.',
      passos: [
        { texto: 'Abra Acordos e clique em "Novo acordo".', rota: '/admin/acordos' },
        { texto: 'Escolha {a.o} {a.s} e {u.o} {u.s}, marque as taxas em atraso que entram no acordo e confira os valores (multa e juros até hoje).' },
        { texto: 'Informe o número de parcelas, o primeiro vencimento e, se houver, a entrada e o desconto. O total e as parcelas aparecem antes de confirmar.' },
        { texto: 'Clique em "Criar acordo". As taxas passam a "Em acordo" e saem do atraso.' },
        { texto: 'Conforme o morador paga, abra o acordo em "Ver detalhes" e use "Registrar pagamento" em cada parcela. Pagando a última, o acordo fica quitado.' },
      ],
    },
    {
      id: 'fundo-reserva',
      titulo: 'Configurar e acompanhar o fundo de reserva',
      descricao: 'Para definir quanto de cada taxa vai para o fundo e ver o saldo.',
      passos: [
        { texto: 'Em Cadastro → Configurações financeiras, defina o saldo inicial do fundo e o percentual de cada ano (padrão 10%).', rota: '/admin/cadastro/configuracoes' },
        { texto: 'Ao lançar uma obra paga com o fundo, marque "Paga pelo fundo de reserva" em Cadastro → Receitas / Despesas (aba Despesas).', rota: '/admin/cadastro/financeiro' },
        { texto: 'Em Visualizar → Fundo de reserva veja o saldo, as obras pagas e o movimento por ano e por mês.', rota: '/admin/visualizar/fundo' },
      ],
    },
    {
      id: 'inadimplencia-evolucao',
      titulo: 'Acompanhar inadimplência e evolução',
      descricao: 'Para ver como o condomínio está ao longo do tempo.',
      passos: [
        { texto: 'Abra Visualizar → Dados dos Moradores e use a coluna Mensalidades (só nas linhas de proprietário) para ver quem está em atraso. Clique em "N em atraso" para ver os meses, o valor e o juros até hoje.', rota: '/admin/visualizar/moradores' },
        { texto: 'No popover, clique em um mês para ir até a taxa {u.do} {u.s} e use "Registrar pagamento".' },
        { texto: 'Abra Visualizar → Taxa de Inadimplência para ver um ano mês a mês.', rota: '/admin/visualizar/inadimplencia' },
        { texto: 'Para saber quem mudou um valor, abra Visualizar → Histórico de alterações e filtre pelo tipo, pela ação ou pelo período.', rota: '/admin/visualizar/historico' },
        { texto: 'Abra Visualizar → Evolução para comparar vários anos, em gráficos e tabela.', rota: '/admin/visualizar/evolucao' },
      ],
    },
  ],
  morador: [
    {
      id: 'ver-apartamentos',
      titulo: 'Ver {u.p} da minha conta',
      descricao: 'Para conferir {u.p} da sua conta.',
      passos: [{ texto: 'Abra o item de {u.p} da sua área no menu.', rota: '/minha-area/apartamentos' }],
    },
    {
      id: 'atualizar-dados',
      titulo: 'Atualizar meus dados',
      descricao: 'Para corrigir nome, telefone ou e-mail.',
      passos: [
        { texto: 'Abra Meus Dados no menu.', rota: '/minha-area/dados' },
        { texto: 'Corrija os campos (se mudar o e-mail, confirme-o) e clique em Salvar.' },
      ],
    },
    {
      id: 'consultar-financeiro',
      titulo: 'Consultar o financeiro e abrir um comprovante',
      descricao: 'Para saber como estão as contas do condomínio.',
      passos: [
        { texto: 'Abra Financeiro no menu.', rota: '/minha-area/financeiro' },
        { texto: 'Escolha o ano e o mês. Os cartões mostram receitas, despesas e saldo.' },
        { texto: 'Nas listas de outras receitas e despesas, clique em "Ver comprovante" para abrir o arquivo em uma nova aba.' },
      ],
    },
    {
      id: 'consultar-fundo',
      titulo: 'Consultar o fundo de reserva',
      descricao: 'Para saber quanto o fundo tem e em que foi usado.',
      passos: [
        { texto: 'Abra Fundo de reserva no menu.', rota: '/minha-area/fundo-reserva' },
        { texto: 'Veja o saldo atual, as obras pagas com o fundo e o movimento por ano.' },
      ],
    },
  ],
};
