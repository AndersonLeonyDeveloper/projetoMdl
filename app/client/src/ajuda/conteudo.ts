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
      'Cadastra proprietários e inquilinos nos apartamentos. Cada apartamento tem no máximo 1 proprietário ativo e pode ter vários inquilinos.',
    passos: [
      { titulo: 'Menu', descricao: 'Use o menu para trocar de tela. Cadastro reúne tudo o que você lança no sistema.', alvo: 'menu-principal' },
      { titulo: 'Local do morador', descricao: 'Escolha o bloco, o apartamento e se a pessoa é proprietária ou inquilina.', alvo: 'select-bloco' },
      { titulo: 'Dados pessoais', descricao: 'Informe nome, CPF, telefone e e-mail. O e-mail precisa ser confirmado.', alvo: 'input-nome' },
      { titulo: 'Salvar', descricao: 'Clique em Salvar. Uma mensagem confirma o cadastro ou explica o que precisa ser corrigido.', alvo: 'botao-salvar-morador' },
    ],
  },
  '/admin/cadastro/taxas': {
    resumo:
      'Cria as taxas de condomínio. O normal é gerar o mês inteiro de uma vez; o lançamento individual serve para casos pontuais.',
    passos: [
      { titulo: 'Gerar taxas do mês', descricao: 'Cria a taxa de todos os apartamentos que ainda não têm uma no mês. Taxas já lançadas não mudam.', alvo: 'gerar-taxas-mes' },
      { titulo: 'Mês, ano e valor', descricao: 'Escolha o mês e o ano. O valor vem do padrão do ano; se mudar, ele passa a ser o novo padrão (taxas antigas não mudam).', alvo: 'input-gerar-valor' },
      { titulo: 'Gerar', descricao: 'Clique em Gerar taxas. O sistema mostra quantas serão criadas e pede confirmação. Depois, o link "Ver taxas do mês" leva ao registro dos pagamentos.', alvo: 'botao-gerar-taxas' },
      { titulo: 'Lançamento individual', descricao: 'Para uma taxa avulsa (por exemplo, com valor diferente), escolha bloco, apartamento, mês, ano e valor aqui.', alvo: 'form-lancar-taxa' },
    ],
  },
  '/admin/cadastro/financeiro': {
    resumo: 'Lança outras receitas (aluguel do salão, multas, eventos) e despesas do condomínio, com comprovante opcional.',
    passos: [
      { titulo: 'Escolha o tipo', descricao: 'Use as abas para lançar uma outra receita ou uma despesa. As taxas de condomínio ficam em Cadastro → Taxas de condomínio.', alvo: 'tabs-cadastro-financeiro' },
      { titulo: 'Descrição, valor e data', descricao: 'Preencha o que foi, quanto e quando. O valor não pode ser negativo.' },
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
    ],
  },
  '/admin/visualizar/financeiro': {
    resumo:
      'Mostra o financeiro de um mês. É aqui que você registra o pagamento das taxas, corrige lançamentos e abre os comprovantes.',
    passos: [
      { titulo: 'Período', descricao: 'Escolha o ano e o mês que quer consultar.', alvo: 'input-ano' },
      { titulo: 'Resumo do mês', descricao: 'Receitas, despesas e saldo do mês escolhido.', alvo: 'resumo-mensal' },
      { titulo: 'Taxas do mês', descricao: 'A situação mostra Adimplente, A vencer (em aberto, ainda no prazo) ou Em atraso (vencida). Em "Registrar pagamento", informe a data. O sistema calcula multa e juros se houve atraso, e você pode ajustar o valor. Se você chegou por um mês em atraso de Dados dos Moradores, a lista mostra só aquele apartamento; use "Ver todos os apartamentos" para voltar.', alvo: 'tabela-taxas' },
      { titulo: 'Corrigir uma taxa', descricao: 'Nas taxas já pagas o botão é Editar: corrija o valor, a data ou o comprovante.', alvo: 'botao-editar-taxa' },
      { titulo: 'Outras receitas e despesas', descricao: 'Estas listas têm o botão Editar para corrigir um lançamento e o link para ver o comprovante.', alvo: 'tabela-despesas' },
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
      'Lista os moradores cadastrados, com bloco, apartamento e tipo. Nas linhas de proprietário, a coluna Mensalidades mostra se a taxa está em dia ou quantas estão em atraso. Um aviso no topo lista os apartamentos sem proprietário.',
    passos: [
      { titulo: 'Lista de moradores', descricao: 'Use os filtros e a paginação da tabela para localizar uma pessoa.', alvo: 'tabela-visualizar-moradores' },
      { titulo: 'Apartamentos sem proprietário', descricao: 'Quando existe algum apartamento vazio ou só com inquilinos, um aviso amarelo aparece no topo, com o botão "Mostrar apenas esses". Nesses apartamentos, a coluna Mensalidades mostra "Sem proprietário" (e o atraso, se houver).', alvo: 'tabela-visualizar-moradores' },
      { titulo: 'Mensalidades', descricao: 'Só o proprietário tem esta coluna: "Em dia" ou "N em atraso". Clique em "N em atraso" para ver cada mensalidade vencida com valor, juros até hoje e total, mais o total devido. Clique em um mês para abrir a taxa em Visualizar → Financeiro. Dá para filtrar por Em atraso e Em dia.', alvo: 'tabela-visualizar-moradores' },
    ],
  },
  '/admin/visualizar/inadimplencia': {
    resumo: 'Consolida a inadimplência de um ano, mês a mês.',
    passos: [
      { titulo: 'Ano', descricao: 'Escolha o ano a consultar.', alvo: 'input-ano' },
      { titulo: 'Inadimplência por mês', descricao: 'Valores adimplentes e inadimplentes de cada mês do ano.', alvo: 'tabela-inadimplencia' },
    ],
  },

  // ---------- Moradores ----------
  '/minha-area/apartamentos': {
    resumo: 'Mostra os apartamentos ligados à sua conta.',
    passos: [
      { titulo: 'Meus apartamentos', descricao: 'Cada item é um apartamento seu, com bloco e número. Se a lista estiver vazia, procure a administração.', alvo: 'lista-meus-apartamentos' },
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
      { titulo: 'Resumo do mês', descricao: 'Receitas, despesas e saldo do condomínio no mês.', alvo: 'resumo-mensal' },
      { titulo: 'Resumo por bloco', descricao: 'Quanto cada bloco tem em dia e em aberto.', alvo: 'tabela-resumo-blocos' },
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
      descricao: 'Para incluir um proprietário ou inquilino em um apartamento.',
      passos: [
        { texto: 'Abra Cadastro → Moradores.', rota: '/admin/cadastro/moradores' },
        { texto: 'Escolha o bloco, o apartamento e o tipo (proprietário ou inquilino).' },
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
        { texto: 'Abra Cadastro → Taxas de condomínio, escolha o mês e o ano, confira o valor e clique em Gerar taxas. Confirme a quantidade.', rota: '/admin/cadastro/taxas' },
        { texto: 'Clique em "Ver taxas do mês" (ou abra Visualizar → Financeiro e escolha o mês).', rota: '/admin/visualizar/financeiro' },
        { texto: 'Na tabela de taxas, clique em "Registrar pagamento" na linha do apartamento. Informe a data (multa e juros são calculados se houve atraso), anexe o comprovante se houver e salve.' },
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
        { texto: 'Abra Visualizar → Financeiro e escolha o ano e o mês do lançamento.', rota: '/admin/visualizar/financeiro' },
        { texto: 'Taxa: clique em Editar (ou Registrar pagamento) na linha. Despesa ou receita: clique em Editar na lista, mais abaixo na página.' },
        { texto: 'Corrija os campos. Para o comprovante, você pode manter, substituir ou remover.' },
        { texto: 'Clique em Salvar. Os resumos do mês já mostram o novo valor.' },
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
      id: 'inadimplencia-evolucao',
      titulo: 'Acompanhar inadimplência e evolução',
      descricao: 'Para ver como o condomínio está ao longo do tempo.',
      passos: [
        { texto: 'Abra Visualizar → Dados dos Moradores e use a coluna Mensalidades (só nas linhas de proprietário) para ver quem está em atraso. Clique em "N em atraso" para ver os meses, o valor e o juros até hoje.', rota: '/admin/visualizar/moradores' },
        { texto: 'No popover, clique em um mês para ir até a taxa daquele apartamento e use "Registrar pagamento".' },
        { texto: 'Abra Visualizar → Taxa de Inadimplência para ver um ano mês a mês.', rota: '/admin/visualizar/inadimplencia' },
        { texto: 'Abra Visualizar → Evolução para comparar vários anos, em gráficos e tabela.', rota: '/admin/visualizar/evolucao' },
      ],
    },
  ],
  morador: [
    {
      id: 'ver-apartamentos',
      titulo: 'Ver meus apartamentos',
      descricao: 'Para conferir os apartamentos ligados à sua conta.',
      passos: [{ texto: 'Abra Meus Apartamentos no menu.', rota: '/minha-area/apartamentos' }],
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
  ],
};
