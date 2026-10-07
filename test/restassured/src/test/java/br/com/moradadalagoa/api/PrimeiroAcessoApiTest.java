package br.com.moradadalagoa.api;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

/**
 * Primeiro acesso do administrador (assistente de configuração) — seção 7.22 de sugestoes-de-testes.md e
 * regras-de-negocio.md, seção 3.5.
 *
 * O primeiro acesso só acontece UMA vez por banco, então esta classe NÃO roda com a suíte normal (grupo `primeiro-acesso`,
 * excluído por padrão) e precisa de uma segunda instância da API num banco vazio:
 *
 *   cd app && npm run db:vazio          # recria o banco vazio (outro arquivo; o de demonstração não é tocado)
 *   cd app && npm run start:vazio       # API na porta 3002 (deixe rodando)
 *   cd test/restassured && mvn test -Pprimeiro-acesso        # outra URL: -DapiUrlVazio=http://host:porta/api
 *
 * Os testes são ENCADEADOS (@Order): cada um parte do estado deixado pelo anterior. Para repetir, rode `npm run db:vazio` de novo
 * e REINICIE o `start:vazio` (a API mantém aberto o arquivo antigo).
 */
@Tag("primeiro-acesso")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class PrimeiroAcessoApiTest {

    private static final String URL = System.getProperty("apiUrlVazio", "http://localhost:3002/api");
    private static final String EMAIL_ADMIN = "admin@condominio.com";
    private static final String SENHA_PADRAO = "senha123";
    private static final String SENHA_NOVA = "senha-nova-123";

    private static String token = null; // do admin, com a senha vigente

    private static RequestSpecification req() {
        return given().baseUri(URL);
    }

    private static Response entrar(String senha) {
        return req().contentType(ContentType.JSON).body(Map.of("email", EMAIL_ADMIN, "senha", senha)).when().post("/auth/login");
    }

    private static RequestSpecification admin() {
        return req().header("Authorization", "Bearer " + token);
    }

    private static Map<String, Object> torres(int agrupadores, int andares, boolean terreo, int porAndar) {
        Map<String, Object> c = new HashMap<>();
        c.put("nome", "Edifício Teste");
        c.put("agrupador_singular", "Torre");
        c.put("agrupador_plural", "Torres");
        c.put("agrupador_genero", "f");
        c.put("agrupador_abrev", "To.");
        c.put("unidade_singular", "Apartamento");
        c.put("unidade_plural", "Apartamentos");
        c.put("unidade_genero", "m");
        c.put("unidade_abrev", "Ap.");
        c.put("agrupadores", agrupadores);
        c.put("andares", andares);
        c.put("tem_terreo", terreo);
        c.put("unidades_por_andar", porAndar);
        c.put("formato_numeracao", "andar_sequencia");
        return c;
    }

    // ---------- Antes da configuração ----------

    @Test
    @Order(1)
    @DisplayName("Banco vazio: o admin padrão entra, o condomínio não está configurado e não há blocos nem apartamentos")
    void estadoInicial() {
        Response login = entrar(SENHA_PADRAO);
        login.then().statusCode(200);
        token = login.path("token");

        admin().when().get("/condominio").then().statusCode(200)
            .body("configurado", equalTo(false))
            .body("total_de_agrupadores", equalTo(0))
            .body("total_de_unidades", equalTo(0));
        admin().when().get("/blocos").then().statusCode(200).body("size()", equalTo(0));
        admin().when().get("/apartamentos").then().statusCode(200).body("size()", equalTo(0));
        req().when().get("/condominio").then().statusCode(401);
    }

    @Test
    @Order(2)
    @DisplayName("Sem estrutura, gerar taxas do mês não tem nenhum apartamento para atender")
    void semApartamentos() {
        admin().queryParam("mes_referencia", 1).queryParam("ano_referencia", 2030)
            .when().get("/financeiro/taxas/gerar-mes/previa").then().statusCode(200)
            .body("total_apartamentos", equalTo(0));
    }

    @Test
    @Order(3)
    @DisplayName("Configuração inválida é recusada com 400 e não cria nada (zero agrupadores, sem andar nem térreo, total excessivo)")
    void configuracaoInvalidaNaoCriaNada() {
        for (Map<String, Object> invalida : List.of(torres(0, 2, false, 3), torres(2, 0, false, 3), torres(200, 100, true, 200))) {
            admin().contentType(ContentType.JSON).body(invalida).when().post("/condominio").then().statusCode(400);
        }
        Map<String, Object> generoInvalido = torres(2, 2, false, 3);
        generoInvalido.put("agrupador_genero", "x");
        admin().contentType(ContentType.JSON).body(generoInvalido).when().post("/condominio").then().statusCode(400);

        admin().when().get("/condominio").then().body("configurado", equalTo(false)).body("total_de_unidades", equalTo(0));
    }

    @Test
    @Order(4)
    @DisplayName("Senha nova curta (menos de 6 caracteres) retorna 400 e também não cria nada")
    void senhaCurtaNaoCriaNada() {
        Map<String, Object> corpo = torres(3, 2, false, 3);
        corpo.put("nova_senha_admin", "abc");
        admin().contentType(ContentType.JSON).body(corpo).when().post("/condominio").then().statusCode(400)
            .body("error", containsString("6 caracteres"));

        admin().when().get("/condominio").then().body("configurado", equalTo(false)).body("total_de_unidades", equalTo(0));
        entrar(SENHA_PADRAO).then().statusCode(200); // a senha padrão continua valendo
    }

    @Test
    @Order(5)
    @DisplayName("A prévia mostra o que será criado e não grava nada")
    void previaNaoGrava() {
        admin().contentType(ContentType.JSON).body(torres(3, 2, false, 3)).when().post("/condominio/previa").then().statusCode(200)
            .body("total_de_unidades", equalTo(18))
            .body("exemplo_andares[0].numeros", org.hamcrest.Matchers.contains("101", "102", "103"));
        admin().when().get("/condominio").then().body("configurado", equalTo(false)).body("total_de_unidades", equalTo(0));
    }

    // ---------- O primeiro acesso ----------

    @Test
    @Order(6)
    @DisplayName("Primeiro acesso: 3 torres × 2 andares (sem térreo) × 3 por andar = 18 unidades, e a senha do admin é trocada")
    void primeiroAcesso() {
        Map<String, Object> corpo = torres(3, 2, false, 3);
        corpo.put("nova_senha_admin", SENHA_NOVA);
        admin().contentType(ContentType.JSON).body(corpo).when().post("/condominio").then().statusCode(201)
            .body("agrupadores", equalTo(3))
            .body("unidades", equalTo(18))
            .body("senha_alterada", equalTo(true));

        // A senha padrão deixa de valer; a nova passa a valer.
        entrar(SENHA_PADRAO).then().statusCode(401);
        Response login = entrar(SENHA_NOVA);
        login.then().statusCode(200);
        token = login.path("token");
    }

    @Test
    @Order(7)
    @DisplayName("Depois do primeiro acesso: estado configurado, nomes gravados e a estrutura com a numeração da prévia")
    void estruturaCriada() {
        admin().when().get("/condominio").then().statusCode(200)
            .body("configurado", equalTo(true))
            .body("nome", equalTo("Edifício Teste"))
            .body("agrupador_singular", equalTo("Torre"))
            .body("agrupador_abrev", equalTo("To."))
            .body("total_de_agrupadores", equalTo(3))
            .body("total_de_unidades", equalTo(18));

        List<Map<String, Object>> blocos = admin().when().get("/blocos").then().statusCode(200).extract().jsonPath().getList("$");
        org.junit.jupiter.api.Assertions.assertEquals(List.of("01", "02", "03"), blocos.stream().map(b -> b.get("numero")).toList());

        int primeiro = (int) blocos.get(0).get("id");
        admin().queryParam("bloco_id", primeiro).when().get("/apartamentos").then().statusCode(200)
            .body("numero", org.hamcrest.Matchers.contains("101", "102", "103", "201", "202", "203"))
            .body("andar", org.hamcrest.Matchers.contains(1, 1, 1, 2, 2, 2));
    }

    @Test
    @Order(8)
    @DisplayName("Não repete o primeiro acesso: 409 e a estrutura não muda")
    void naoRepete() {
        admin().contentType(ContentType.JSON).body(torres(1, 1, false, 1)).when().post("/condominio").then().statusCode(409);
        admin().when().get("/condominio").then().body("total_de_unidades", equalTo(18));
    }

    @Test
    @Order(9)
    @DisplayName("As mensagens da API já usam os nomes escolhidos, com a concordância de gênero")
    void mensagensComOsNovosNomes() {
        admin().contentType(ContentType.JSON).body(Map.of("numero", "")).when().post("/blocos").then().statusCode(400)
            .body("error", equalTo("Número da torre é obrigatório."));
        admin().contentType(ContentType.JSON).body(Map.of("bloco_id", 999999, "numero", "101")).when().post("/apartamentos").then()
            .statusCode(404).body("error", equalTo("Torre não encontrada."));
    }

    @Test
    @Order(10)
    @DisplayName("Depois de criada, a estrutura cresce: novo agrupador e nova unidade entram no fim da lista")
    void estruturaCresce() {
        admin().contentType(ContentType.JSON).body(Map.of("numero", "04")).when().post("/blocos").then().statusCode(201);
        List<Object> numeros = admin().when().get("/blocos").then().extract().jsonPath().getList("numero");
        org.junit.jupiter.api.Assertions.assertEquals(List.of("01", "02", "03", "04"), numeros);

        int primeiro = admin().when().get("/blocos").then().extract().path("[0].id");
        admin().contentType(ContentType.JSON).body(Map.of("bloco_id", primeiro, "numero", "301", "andar", 3)).when()
            .post("/apartamentos").then().statusCode(201);
        admin().queryParam("bloco_id", primeiro).when().get("/apartamentos").then().statusCode(200)
            .body("numero[-1]", equalTo("301"))
            .body("andar[-1]", equalTo(3));
    }

    @Test
    @Order(11)
    @DisplayName("Gerar taxas do mês passa a considerar as unidades criadas (18 do assistente + 1 acrescentada)")
    void taxasConsideramAEstrutura() {
        admin().queryParam("mes_referencia", 1).queryParam("ano_referencia", 2030)
            .when().get("/financeiro/taxas/gerar-mes/previa").then().statusCode(200)
            .body("total_apartamentos", equalTo(19));
    }

    @Test
    @Order(12)
    @DisplayName("O histórico registra a criação da estrutura, sem guardar a senha nova")
    void historico() {
        Response r = admin().queryParam("entidade", "configuracao").queryParam("acao", "configurar_estrutura")
            .when().get("/financeiro/auditoria");
        r.then().statusCode(200)
            .body("itens.acao", hasItem("configurar_estrutura"))
            .body("itens[0].detalhe", equalTo("Estrutura criada: 3 torres, 18 apartamentos"))
            .body("itens[0].usuario_email", equalTo(EMAIL_ADMIN));
        String bruto = r.asString();
        org.junit.jupiter.api.Assertions.assertFalse(bruto.contains(SENHA_NOVA), "a senha nova não pode aparecer no histórico");
        org.junit.jupiter.api.Assertions.assertFalse(bruto.contains("nova_senha"), "o campo da senha não pode aparecer no histórico");
        r.then().body("itens[0].depois.agrupadores", equalTo(3));
    }
}
