package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Rateio de despesas por bloco (`bloco_id` na despesa e `GET /financeiro/resumo/blocos`) — seção 7.19 de
 * sugestoes-de-testes.md e regras-de-negocio.md, seção 4.4. Despesa geral (sem bloco) e outras receitas se dividem por
 * igual entre os blocos; despesa de bloco fica só nele. Saldo do bloco = receitas − despesas.
 * Os testes usam anos futuros aleatórios, para o mês estar vazio, e deixam lançamentos que a API não apaga.
 */
class RateioPorBlocoApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
    }

    private static int blocoId(String numero) {
        return como(admin).when().get("/blocos").then().extract().jsonPath().getInt("find { it.numero == '" + numero + "' }.id");
    }

    private static int anoLivre() {
        return ThreadLocalRandom.current().nextInt(2100, 2900);
    }

    private static Response despesa(int ano, double valor, Object blocoId) {
        var corpo = new java.util.HashMap<String, Object>(Map.of("descricao", "Rateio " + UUID.randomUUID(), "valor", valor, "data", ano + "-02-10"));
        if (blocoId != null) corpo.put("bloco_id", blocoId);
        return como(admin).contentType(ContentType.JSON).body(corpo).when().post("/financeiro/despesas");
    }

    private static List<Map<String, Object>> resumo(int ano) {
        return como(admin).queryParam("ano", ano).queryParam("mes", 2).when().get("/financeiro/resumo/blocos")
            .then().statusCode(200).extract().jsonPath().getList("$");
    }

    private static double campo(Map<String, Object> linha, String nome) {
        return ((Number) linha.get(nome)).doubleValue();
    }

    private static Map<String, Object> doBloco(List<Map<String, Object>> linhas, String numero) {
        return linhas.stream().filter(l -> numero.equals(l.get("bloco_numero"))).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("Mês sem lançamentos: nenhum bloco tem despesa, receita nem saldo")
    void mesVazio() {
        for (Map<String, Object> l : resumo(anoLivre())) {
            org.junit.jupiter.api.Assertions.assertEquals(0.0, campo(l, "despesas"), 0.001);
            org.junit.jupiter.api.Assertions.assertEquals(0.0, campo(l, "receitas"), 0.001);
            org.junit.jupiter.api.Assertions.assertEquals(0.0, campo(l, "saldo"), 0.001);
        }
    }

    @Test
    @DisplayName("Despesa geral é dividida por igual entre os blocos; a de um bloco fica só nele")
    void geralEEspecifica() {
        int ano = anoLivre();
        despesa(ano, 1200, null).then().statusCode(201);
        for (Map<String, Object> l : resumo(ano)) {
            org.junit.jupiter.api.Assertions.assertEquals(100.0, campo(l, "despesas_rateadas"), 0.001);
            org.junit.jupiter.api.Assertions.assertEquals(-100.0, campo(l, "saldo"), 0.001);
        }
        despesa(ano, 600, blocoId("07")).then().statusCode(201);
        List<Map<String, Object>> linhas = resumo(ano);
        Map<String, Object> b07 = doBloco(linhas, "07");
        org.junit.jupiter.api.Assertions.assertEquals(600.0, campo(b07, "despesas_especificas"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(700.0, campo(b07, "despesas"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(-700.0, campo(b07, "saldo"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(100.0, campo(doBloco(linhas, "01"), "despesas"), 0.001);
    }

    @Test
    @DisplayName("Divisão com resto de centavos: a soma fecha exatamente e os blocos diferem no máximo 1 centavo")
    void restoDeCentavos() {
        int ano = anoLivre();
        despesa(ano, 1000, null).then().statusCode(201); // 1000 / 12 = 83,33 com resto de 4 centavos
        List<Map<String, Object>> linhas = resumo(ano);
        long soma = 0;
        long min = Long.MAX_VALUE;
        long max = Long.MIN_VALUE;
        for (Map<String, Object> l : linhas) {
            long centavos = Math.round(campo(l, "despesas_rateadas") * 100);
            soma += centavos;
            min = Math.min(min, centavos);
            max = Math.max(max, centavos);
        }
        org.junit.jupiter.api.Assertions.assertEquals(100000L, soma);
        org.junit.jupiter.api.Assertions.assertTrue(max - min <= 1);
    }

    @Test
    @DisplayName("Outras receitas também são divididas por igual entre os blocos")
    void outrasReceitas() {
        int ano = anoLivre();
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "Salão " + UUID.randomUUID(), "valor", 600, "data", ano + "-02-12"))
            .when().post("/financeiro/outras-receitas").then().statusCode(201);
        for (Map<String, Object> l : resumo(ano)) {
            org.junit.jupiter.api.Assertions.assertEquals(50.0, campo(l, "outras_receitas_rateadas"), 0.001);
            org.junit.jupiter.api.Assertions.assertEquals(50.0, campo(l, "receitas"), 0.001);
        }
    }

    @Test
    @DisplayName("A soma dos saldos dos blocos é igual ao saldo mensal (competência)")
    void somaDosSaldos() {
        for (int[] periodo : new int[][] {{2023, 5}, {2025, 3}, {2026, 9}}) {
            List<Map<String, Object>> linhas = como(admin).queryParam("ano", periodo[0]).queryParam("mes", periodo[1])
                .when().get("/financeiro/resumo/blocos").then().extract().jsonPath().getList("$");
            double soma = linhas.stream().mapToDouble(l -> campo(l, "saldo")).sum();
            double mensal = como(admin).queryParam("ano", periodo[0]).queryParam("mes", periodo[1])
                .when().get("/financeiro/resumo/mensal").then().extract().jsonPath().getDouble("saldo");
            org.junit.jupiter.api.Assertions.assertEquals(mensal, soma, 0.02, "mês " + periodo[1] + "/" + periodo[0]);
        }
    }

    @Test
    @DisplayName("Seed: em 03/2025 só os blocos 03 e 07 têm despesa específica (impermeabilização)")
    void seed() {
        List<Map<String, Object>> linhas = como(admin).queryParam("ano", 2025).queryParam("mes", 3)
            .when().get("/financeiro/resumo/blocos").then().extract().jsonPath().getList("$");
        org.junit.jupiter.api.Assumptions.assumeTrue(campo(doBloco(linhas, "03"), "despesas_especificas") > 0, "banco sem o seed novo");
        org.junit.jupiter.api.Assertions.assertTrue(campo(doBloco(linhas, "07"), "despesas_especificas") > 0);
        org.junit.jupiter.api.Assertions.assertEquals(0.0, campo(doBloco(linhas, "01"), "despesas_especificas"), 0.001);
    }

    @Test
    @DisplayName("Bloco inexistente ou inválido retorna 400; bloco vazio vira geral")
    void validacao() {
        despesa(anoLivre(), 10, 99999999).then().statusCode(400);
        despesa(anoLivre(), 10, "abc").then().statusCode(400);
        despesa(anoLivre(), 10, "").then().statusCode(201);
    }

    @Test
    @DisplayName("Listagem traz bloco_numero; editar troca ou mantém o bloco; ausência do campo mantém")
    void edicao() {
        int ano = anoLivre();
        int id = despesa(ano, 500, blocoId("07")).then().statusCode(201).extract().path("id");
        java.util.function.Supplier<Map<String, Object>> atual = () -> como(admin).queryParam("ano", ano).queryParam("mes", 2)
            .when().get("/financeiro/despesas").then().extract().jsonPath().<Map<String, Object>>getList("findAll { it.id == " + id + " }").get(0);
        org.junit.jupiter.api.Assertions.assertEquals("07", atual.get().get("bloco_numero"));

        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", 500, "data", ano + "-02-10"))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals("07", atual.get().get("bloco_numero"), "sem bloco_id no corpo mantém");

        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", 500, "data", ano + "-02-10", "bloco_id", blocoId("02")))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals("02", atual.get().get("bloco_numero"));

        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", 500, "data", ano + "-02-10", "bloco_id", ""))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertNull(atual.get().get("bloco_numero"));
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", 500, "data", ano + "-02-10", "bloco_id", 99999999))
            .when().put("/financeiro/despesas/" + id).then().statusCode(400);
    }

    @Test
    @DisplayName("Despesa cancelada sai do rateio e do bloco; a troca de bloco fica no histórico")
    void canceladaEHistorico() {
        int ano = anoLivre();
        int id = despesa(ano, 1200, blocoId("07")).then().statusCode(201).extract().path("id");
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "y", "valor", 1200, "data", ano + "-02-10", "bloco_id", blocoId("02")))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);
        como(admin).queryParam("entidade", "despesa").queryParam("entidade_id", id).queryParam("acao", "editar")
            .when().get("/financeiro/auditoria").then().statusCode(200)
            .body("itens[0].antes.bloco_id", equalTo(blocoId("07"))).body("itens[0].depois.bloco_id", equalTo(blocoId("02")));

        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "Teste de rateio"))
            .when().post("/financeiro/despesas/" + id + "/cancelar").then().statusCode(200);
        for (Map<String, Object> l : resumo(ano)) org.junit.jupiter.api.Assertions.assertEquals(0.0, campo(l, "despesas"), 0.001);
    }

    @Test
    @DisplayName("Qualquer perfil logado consulta o resumo por bloco; sem ano ou mês retorna 400; sem token, 401")
    void acesso() {
        como(proprietario).queryParam("ano", 2025).queryParam("mes", 3).when().get("/financeiro/resumo/blocos").then().statusCode(200);
        como(admin).when().get("/financeiro/resumo/blocos").then().statusCode(400);
        semLogin().queryParam("ano", 2025).queryParam("mes", 3).when().get("/financeiro/resumo/blocos").then().statusCode(401);
    }
}
