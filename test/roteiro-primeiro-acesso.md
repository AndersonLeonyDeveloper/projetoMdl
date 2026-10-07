# Roteiro: testar o primeiro acesso do administrador

O primeiro acesso (assistente de configuração) só acontece **uma vez por banco**: depois que a estrutura é criada, ela não pode ser refeita pela aplicação. Por isso ele não pode ser testado no banco de demonstração. Este roteiro usa um **segundo banco, vazio**, servido por uma **segunda instância da API** (porta 3002), sem tocar no banco de demonstração nem na API principal (porta 3001).

Regras: [`../regras-de-negocio/regras-de-negocio.md`](../regras-de-negocio/regras-de-negocio.md), seções 3.4 e 3.5. Cenários: seção 7.22 de [`sugestoes-de-testes.md`](../regras-de-negocio/sugestoes-de-testes.md).

## Quem é o "usuário de primeira vez"
É o administrador padrão (`admin@condominio.com`, senha `senha123`). O que muda não é o usuário, e sim o estado do banco: num banco vazio ele cai no assistente; no banco de demonstração ele já encontra tudo configurado.

## 1. Criar o banco vazio

```bash
cd app
npm run db:vazio
```

Cria `app/server/data/primeiro-acesso/condominio.sqlite` (ignorado pelo git), sem estrutura e só com o administrador padrão. **Apaga e recria o arquivo a cada execução**, e recusa o caminho do banco de demonstração (`data/condominio.sqlite`). Outro caminho: `DATABASE_PATH=/tmp/x/condominio.sqlite npm run db:vazio -w server`.

## 2. Subir a segunda instância

Em terminais separados, dentro de `app/`:

```bash
npm run start:vazio   # API na porta 3002, no banco vazio
npm run dev:vazio     # tela em http://localhost:5174, apontando para a API 3002
```

A API principal (3001) e a tela principal (5173) podem continuar no ar, no banco de demonstração.

## 3. Roteiro manual (navegador)

Abra `http://localhost:5174` e entre com `admin@condominio.com` / `senha123`.

1. **Redirecionamento:** você cai em "Configuração inicial". Tente abrir `/admin/taxas` ou `/admin`: volta para o assistente.
2. **Modelos e nomes:** escolha "Torres de apartamentos" (preenche Torre/Torres, feminino, `To.`); troque para "Casas em ruas" e veja os campos de andares/térreo sumirem.
3. **Prévia:** com Torres, 3 torres, 2 andares, sem térreo, 3 por andar, a prévia diz 18 unidades, com 101–103 e 201–203. Marque "Com térreo": sobe para 27 e aparece o térreo `01–03`. Troque a numeração para "Sequencial": 01, 02, 03… O botão "Criar estrutura" só habilita com uma prévia válida.
4. **Validações:** 0 torres, 200 torres com 100 andares (passa de 10.000 unidades), senha nova com menos de 6 caracteres: cada uma mostra o erro e não cria nada.
5. **Criar:** preencha o nome do condomínio, uma senha nova e clique em "Criar estrutura". Você vai para a administração; o menu lateral mostra o nome do condomínio.
6. **Nomes aplicados:** as telas, as colunas e a ajuda falam em "torre" e "apartamento" (abra o `?` e inicie o tour de uma tela).
7. **Senha:** saia e tente `senha123`: recusada. A senha nova entra.
8. **Não repete:** `http://localhost:5174/configuracao-inicial` leva de volta à administração.
9. **Trocar os nomes:** Cadastro → Nomes do condomínio; troque "Torre" por "Edifício" (masculino) e confira as frases e as mensagens de erro (ex.: cadastro de morador sem escolher o agrupador).
10. **Histórico:** Visualizar → Histórico de alterações mostra "Estrutura configurada" e "Nomes alterados", sem a senha.
11. **Morador sem configuração (opcional):** para ver "Configuração pendente", faça o passo 1 de novo e entre, sem criar a estrutura, com um usuário que não seja o admin (não há outro usuário no banco vazio; crie um à mão no banco se quiser conferir).

Cada rodada completa exige um banco novo (passo 1).

## 4. Testes de API

A classe `PrimeiroAcessoApiTest` (grupo `primeiro-acesso`) roda à parte da suíte normal:

```bash
cd app && npm run db:vazio && npm run start:vazio      # deixe a API rodando
cd test/restassured && mvn test -Pprimeiro-acesso      # outra URL: -DapiUrlVazio=http://host:porta/api
```

- Os 12 testes são **encadeados** (`@Order`): cada um parte do estado deixado pelo anterior. Não rode um isolado.
- `mvn test` sem o perfil **não** executa essa classe (o grupo é excluído por padrão).
- **Para repetir:** rode `npm run db:vazio` de novo **e reinicie** `npm run start:vazio`, porque a API mantém aberto o arquivo antigo.

## 5. Limpeza

Pare a API 3002 e a tela 5174 (Ctrl+C). O banco vazio fica em `app/server/data/primeiro-acesso/` e pode ser apagado à vontade; o `db:vazio` o recria.

## Limitações

- Cada rodada testa **uma** configuração (a da classe: 3 torres × 2 andares × 3 por andar, sem térreo). "Sem andares" e "sequencial" são conferidos pela prévia (`ConfiguracaoCondominioApiTest`) e pelo roteiro manual.
- Não há automação de interface (Playwright): o roteiro da seção 3 é manual.
