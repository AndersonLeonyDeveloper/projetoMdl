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
| **Admin** (síndico) | Cadastrar/editar moradores; lançar receitas e despesas; visualizar financeiro consolidado de todos os blocos; visualizar inadimplência geral; gerenciar usuários |
| **Proprietário** | Visualizar/editar seus próprios dados e do inquilino vinculado ao seu apartamento; visualizar o financeiro do condomínio (leitura); visualizar sua própria situação de adimplência |
| **Inquilino** | Visualizar seus próprios dados; visualizar o financeiro do condomínio (leitura) |

**Regras de acesso:**
- Um usuário só pode ver/editar dados de moradores vinculados ao(s) apartamento(s) associados à sua conta.
- Proprietário pode ter mais de um apartamento vinculado ("Meus Apartamentos").
- Apenas Admin tem acesso às telas de Cadastro de Receitas, Despesas e Moradores.
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
| Tipo (Proprietário/Inquilino) | Sim | Um apartamento pode ter 1 proprietário e 1 inquilino ativos simultaneamente |
| Nome | Sim | — |
| Telefone | Sim | Formato (DD) 9XXXX-XXXX |
| CPF | Sim, apenas se a pessoa possuir algum vínculo do tipo Proprietário | Validação de dígito verificador |
| E-mail | Sim | Formato de e-mail válido, único por pessoa |
| Confirmar e-mail | Sim | Deve ser idêntico ao campo E-mail |

### 3.3 Regras
- Um apartamento pode existir sem inquilino cadastrado (apenas proprietário).
- Editar o morador exige reconfirmação do e-mail (campo "Confirmar e-mail").
- Exclusão/desativação de vínculo é uma ação restrita ao Admin; o histórico de vínculos desativados é preservado (não é hard delete).
- Trocar o inquilino de um apartamento desativa o vínculo anterior e cria um novo — não sobrescreve o registro existente.

## 4. Módulo Financeiro

### 4.1 Receitas — Taxa de Condomínio
- Lançada por apartamento, por mês/ano de referência.
- Campos: valor da taxa, juros (se em atraso), data de pagamento, situação (Adimplente/Inadimplente), comprovante (upload de nota fiscal/recibo/foto).
- **Situação é derivada**: se não houver `data_pagamento` registrada até o vencimento, o apartamento passa a `Inadimplente` no mês de referência.
- **Meses em atraso**: contagem cumulativa de meses consecutivos em que o apartamento está sem pagamento — exibido no cadastro (ex.: "3 meses").

### 4.2 Receitas — Outras Receitas
- Não vinculadas a apartamento (nível condomínio): ex. bingo, propaganda, aluguel de espaço, eventos.
- Campos: tipo/descrição, data, valor, comprovante.

### 4.3 Despesas
- Nível condomínio (não vinculadas a apartamento).
- Campos: tipo/descrição, data, valor, comprovante.
- Exemplos observados no protótipo: produtos de limpeza, manutenção (cerca, muro, quadra, pintura de blocos).

### 4.4 Cálculos
- **Saldo mensal (por bloco)** = soma(receitas do bloco no mês) − soma(despesas do bloco no mês).
  - Despesas de nível condomínio são rateadas/atribuídas conforme regra a definir (ex.: rateio igualitário entre blocos, ou lançamento manual por bloco).
- **Total adimplente (mês/bloco)** = soma dos valores de taxa de condomínio pagos no prazo.
- **Total inadimplente (mês/bloco)** = soma dos valores de taxa de condomínio em aberto/atrasados.
- Indicadores visuais: saldo positivo (verde/seta para cima) e saldo negativo (vermelho/seta para baixo).

### 4.5 Consultas / Filtros
- Financeiro pode ser filtrado por Ano → Mês → Tipo de receita (Taxa de Condomínio / Outras Receitas) → Bloco.
- Tela de Inadimplência: consolidado anual, com drill-down por mês → bloco → apartamento (lista de proprietário/inquilino e situação).

## 5. Autenticação

- Login por e-mail e senha.
- Fluxo de recuperação de senha: usuário informa e-mail → sistema envia nova senha por e-mail (fluxo "Solicitar" → confirmação).
- Alteração de senha disponível dentro da área logada ("Nova Senha"), tanto para Proprietário quanto Inquilino.
- Cadastro de novo usuário (self-service) redireciona para vínculo com um morador já cadastrado pelo Admin (não permite criar morador "solto").

## 6. Comprovantes (Upload de Arquivo)

- Aplicável a: taxa de condomínio, outras receitas, despesas.
- Formatos esperados: imagem (foto/câmera) ou documento (nota fiscal/recibo).
- Ação "Clique para visualizar a nota" abre o comprovante em modal.

## 7. Pontos de Ambiguidade a Validar (para futura clarificação)

- Regra de rateio de despesas condominiais entre os blocos.
- Regra exata de cálculo de juros por atraso (percentual fixo? progressivo por mês?).
- Se um apartamento pode ter mais de um proprietário/inquilino (histórico de troca de morador).
- Regra de expiração/validade da "nova senha" enviada por e-mail.
