# IA generativa em testes: padrões de prompt e agentes possíveis

> Análise feita em 01/10/2026 a partir dos pedidos feitos durante o desenvolvimento deste projeto.
> A amostra é uma única sessão de trabalho, então os padrões abaixo são **hipóteses fundamentadas**, não resultado de medição.
> Nenhum dos agentes descritos existe ainda. Os candidatos estão no backlog (`melhorias-e-ideias.md`, item 3.6).

## 1. Padrões observados nos pedidos

| # | Padrão do pedido (exemplo desta sessão) | O que a IA fez | Papel de agente que isso sugere |
|---|---|---|---|
| 1 | Sintoma + evidência + "por quê?" ("após o db:reset os campos ficaram vazios", com print) | Leu o print, achou `reset.js` apagando blocos e apartamentos, explicou a causa | **Triagem de bug / causa raiz** |
| 2 | "Faz sentido? O que mudaria nas regras de negócio?" | Comparou o pedido com schema e regras e listou impactos | **Análise de impacto de mudança** |
| 3 | Dados com restrições ("1 proprietário por apto, 3 inquilinos, nomes únicos e americanizados") | Escreveu script determinístico e idempotente e conferiu por SQL | **Gerador de massa de dados com invariantes** |
| 4 | "Realista, respaldado na realidade" | Calibrou taxa, inadimplência e despesas com premissas explícitas | **Gerador de cenários de domínio** |
| 5 | Pedido que contradiz o sistema (3 inquilinos ativos × índice único; "12 aptos" × lista de 16; apto 305 inexistente) | Apontou o conflito antes de implementar | **Crítico de requisitos** (ambiguidades e contradições) |
| 6 | "Registre melhorias/cenários de teste num documento, com `[ ]`" | Passou a alimentar `melhorias-e-ideias.md` e `sugestoes-de-testes.md` | **Escriba de documentação viva** |
| 7 | "Documento para mostrar ao candidato a síndico" | Traduziu código e decisões em texto de negócio | **Gerador de documentação para stakeholder** |
| 8 | "Pergunte antes de implementar" e modo de planejamento | Plano → aprovação → execução | **Controle humano (human-in-the-loop)** |

O padrão 5 é o de maior valor para testes: a maior parte dos defeitos de requisito apareceu aí, antes de qualquer código.

## 2. Estrutura comum dos prompts bons
Contexto (projeto, documento de regras) + Objetivo + Restrições (únicos, idempotente, regra de negócio) + Critério de qualidade (realista) + Formato de saída (documento existente, marcadores) + Verificação (consulta SQL, build) + Ponto de aprovação humana. Essa é a anatomia de um prompt de sistema de agente.

## 3. Agentes candidatos (do mais simples ao mais complexo)
1. **Escriba de TCs**: recebe uma funcionalidade nova ou alterada e adiciona itens no formato já usado (`- [ ] **Título**: descrição. \`E2E|API|DB\``) em `sugestoes-de-testes.md`. Pronto para existir: o formato e o documento já existem e há ~80 itens como exemplo.
2. **Gerador de ACs**: lê `regras-de-negocio.md` e a modelagem e produz critérios de aceite em Dado/Quando/Então, listando as ambiguidades encontradas em vez de adivinhar.
3. **Gerador de TCs combinatórios**: a partir da tabela de campos (seção 3.2 das regras) gera campo × tipo de valor inválido. A seção "Sugestão de uso com IA" do documento de testes já descreve isso.
4. **Gerador de testes automatizados**: transforma TC em teste Playwright ou de API. O código já ajuda: usa `data-testid` (`select-bloco`, `input-ano`, `tabela-inadimplencia`, `tabela-evolucao`) e rotas REST simples.
5. **Gerador de massa de dados**: restrições → script determinístico + verificação de invariantes (como os dois `db:seed:*`).
6. **Seletor de regressão**: dado um diff, indica quais TCs revisitar (usa o mapa regra → TC).

## 4. Riscos e como tratar
- **Problema do oráculo**: testes gerados só a partir do código repetem os bugs do código. A fonte de verdade deve ser a regra de negócio, e o agente deve sinalizar divergência código × regra.
- **Alucinação diante de ambiguidade**: o agente deve perguntar ou registrar a dúvida (como na regra "12 ou 16 aptos?").
- **Como avaliar o agente**: o próprio projeto tem casos de avaliação prontos. O bug do reset (diagnóstico esperado conhecido), a contradição do índice único e os invariantes do seed financeiro. Também dá para semear bugs e medir quantos o conjunto de testes gerado pega (teste de mutação).
- **Determinismo**: saída estruturada, formato fixo e semente fixa para dados, para poder comparar execuções.

## 5. Caminho de estudo sugerido
1. Começar pelo **Escriba de TCs**, como skill ou subagente do Claude Code (`.claude/agents/` ou `.claude/skills/`), gravando em `sugestoes-de-testes.md`.
2. Medir: apagar uma seção de TCs existente, pedir ao agente que a recrie e comparar cobertura.
3. Evoluir para ACs (agente 2) e depois testes automatizados (agente 4), sempre com um ponto de aprovação humana.
