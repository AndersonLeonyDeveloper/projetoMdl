package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Fator da taxa por apartamento (`PUT /apartamentos/:id/fator-taxa`, `POST /blocos/:id/fator-taxa`) — seção 7.18 de
 * sugestoes-de-testes.md e regras-de-negocio.md, seção 4.6. A taxa gerada em lote é o valor-base do ano × o fator.
 * Os testes mexem nos fatores e os devolvem a 1 no fim.
 */
class FatorDaTaxaApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
    }

    @AfterAll
    static void devolverFatoresA1() {
        List<Map<String, Object>> apartamentos = todos();
        for (Map<String, Object> a : apartamentos) {
            if (((Number) a.get("fator_taxa")).doubleValue() != 1.0) fator(admin, ((Number) a.get("id")).intValue(), 1);
        }
    }

    private static List<Map<String, Object>> todos() {
        return como(admin).when().get("/apartamentos").then().statusCode(200).extract().jsonPath().getList("$");
    }

    private static Response fator(String token, int id, Object valor) {
        return como(token).contentType(ContentType.JSON).body(Map.of("fator", valor)).when().put("/apartamentos/" + id + "/fator-taxa");
    }

    private static int umApartamento() {
        return ((Number) todos().get(ThreadLocalRandom.current().nextInt(todos().size())).get("id")).intValue();
    }

    @Test
    @DisplayName("Todo apartamento tem fator e o padrão é 1")
    void padraoE1() {
        for (Map<String, Object> a : todos()) org.junit.jupiter.api.Assertions.assertNotNull(a.get("fator_taxa"));
    }

    @Test
    @DisplayName("Definir o fator grava e aparece em GET /apartamentos; arredonda em 4 casas")
    void definirFator() {
        int id = umApartamento();
        fator(admin, id, 1.2).then().statusCode(200).body("fator_taxa", numero(1.2));
        fator(admin, id, 1.23456789).then().statusCode(200).body("fator_taxa", numero(1.2346));
        double gravado = todos().stream().filter(a -> ((Number) a.get("id")).intValue() == id).findFirst().get().get("fator_taxa") instanceof Number n ? n.doubleValue() : -1;
        org.junit.jupiter.api.Assertions.assertEquals(1.2346, gravado, 0.00001);
        fator(admin, id, 1).then().statusCode(200);
    }

    @Test
    @DisplayName("Valores-limite: 0,1 e 5 são aceitos; abaixo, acima e não numéricos retornam 400")
    void validacao() {
        int id = umApartamento();
        fator(admin, id, 0.1).then().statusCode(200);
        fator(admin, id, 5).then().statusCode(200);
        for (Object invalido : List.of(0, 0.05, 5.01, -1, "abc", "")) fator(admin, id, invalido).then().statusCode(400);
        como(admin).contentType(ContentType.JSON).body("{}").when().put("/apartamentos/" + id + "/fator-taxa").then().statusCode(400);
        fator(admin, id, 1).then().statusCode(200);
    }

    @Test
    @DisplayName("Apartamento inexistente 404; morador 403; sem token 401")
    void acesso() {
        int id = umApartamento();
        fator(admin, 99999999, 1).then().statusCode(404);
        fator(proprietario, id, 2).then().statusCode(403);
        semLogin().contentType(ContentType.JSON).body(Map.of("fator", 2)).when().put("/apartamentos/" + id + "/fator-taxa").then().statusCode(401);
    }

    @Test
    @DisplayName("Aplicar a um bloco muda os apartamentos dele e informa quantos foram alterados")
    void fatorDoBloco() {
        List<Map<String, Object>> blocos = como(admin).when().get("/blocos").then().extract().jsonPath().getList("$");
        int blocoId = ((Number) blocos.get(ThreadLocalRandom.current().nextInt(blocos.size())).get("id")).intValue();
        como(admin).contentType(ContentType.JSON).body(Map.of("fator", 1.5)).when().post("/blocos/" + blocoId + "/fator-taxa")
            .then().statusCode(200).body("fator_taxa", numero(1.5));
        for (Map<String, Object> a : todos()) {
            if (((Number) a.get("bloco_id")).intValue() == blocoId) {
                org.junit.jupiter.api.Assertions.assertEquals(1.5, ((Number) a.get("fator_taxa")).doubleValue(), 0.0001);
            }
        }
        // repetir o mesmo fator não altera ninguém
        como(admin).contentType(ContentType.JSON).body(Map.of("fator", 1.5)).when().post("/blocos/" + blocoId + "/fator-taxa")
            .then().statusCode(200).body("alterados", equalTo(0));
        como(admin).contentType(ContentType.JSON).body(Map.of("fator", 9)).when().post("/blocos/" + blocoId + "/fator-taxa").then().statusCode(400);
        como(admin).contentType(ContentType.JSON).body(Map.of("fator", 1)).when().post("/blocos/99999999/fator-taxa").then().statusCode(404);
        como(proprietario).contentType(ContentType.JSON).body(Map.of("fator", 1)).when().post("/blocos/" + blocoId + "/fator-taxa").then().statusCode(403);
        como(admin).contentType(ContentType.JSON).body(Map.of("fator", 1)).when().post("/blocos/" + blocoId + "/fator-taxa").then().statusCode(200);
    }

    @Test
    @DisplayName("Gerar o mês usa valor-base × fator (com 2 casas), e a prévia diz quantos têm fator diferente")
    void gerarComFator() {
        int ano = ThreadLocalRandom.current().nextInt(2100, 2900);
        definirTaxaDoAno(admin, ano, 300);
        int id = umApartamento();
        int outro = id;
        while (outro == id) outro = umApartamento();
        fator(admin, id, 1.2).then().statusCode(200);
        fator(admin, outro, 1.0333).then().statusCode(200);

        como(admin).queryParam("mes_referencia", 1).queryParam("ano_referencia", ano).when().get("/financeiro/taxas/gerar-mes/previa")
            .then().statusCode(200).body("valor", numero(300)).body("com_fator_diferente", equalTo(2));
        como(admin).contentType(ContentType.JSON).body(Map.of("mes_referencia", 1, "ano_referencia", ano))
            .when().post("/financeiro/taxas/gerar-mes").then().statusCode(201)
            .body("valor", numero(300)).body("com_fator_diferente", equalTo(2));

        List<Map<String, Object>> taxas = como(admin).queryParam("ano", ano).queryParam("mes", 1)
            .when().get("/financeiro/taxas").then().extract().jsonPath().getList("$");
        for (Map<String, Object> t : taxas) {
            int apto = ((Number) t.get("apartamento_id")).intValue();
            double esperado = apto == id ? 360.0 : apto == outro ? 309.99 : 300.0;
            org.junit.jupiter.api.Assertions.assertEquals(esperado, ((Number) t.get("valor")).doubleValue(), 0.001, "apartamento " + apto);
        }
        fator(admin, id, 1).then().statusCode(200);
        fator(admin, outro, 1).then().statusCode(200);
    }

    @Test
    @DisplayName("Mudar o fator depois não altera taxas já geradas")
    void taxasJaGeradasNaoMudam() {
        int ano = ThreadLocalRandom.current().nextInt(2100, 2900);
        definirTaxaDoAno(admin, ano, 300);
        int id = umApartamento();
        fator(admin, id, 2).then().statusCode(200);
        como(admin).contentType(ContentType.JSON).body(Map.of("mes_referencia", 2, "ano_referencia", ano))
            .when().post("/financeiro/taxas/gerar-mes").then().statusCode(201);
        fator(admin, id, 3).then().statusCode(200);
        double valor = como(admin).queryParam("ano", ano).queryParam("mes", 2).queryParam("apartamento_id", id)
            .when().get("/financeiro/taxas").then().extract().jsonPath().getDouble("[0].valor");
        org.junit.jupiter.api.Assertions.assertEquals(600.0, valor, 0.001);
        fator(admin, id, 1).then().statusCode(200);
    }

    @Test
    @DisplayName("Mudar o fator fica no histórico; repetir o mesmo valor não grava")
    void historico() {
        int id = umApartamento();
        fator(admin, id, 1).then().statusCode(200);
        int antes = como(admin).queryParam("entidade", "apartamento").queryParam("entidade_id", id)
            .when().get("/financeiro/auditoria").then().extract().path("total");
        fator(admin, id, 1.7).then().statusCode(200);
        fator(admin, id, 1.7).then().statusCode(200);
        como(admin).queryParam("entidade", "apartamento").queryParam("entidade_id", id).when().get("/financeiro/auditoria")
            .then().statusCode(200).body("total", equalTo(antes + 1)).body("itens[0].depois.fator_taxa", numero(1.7));
        fator(admin, id, 1).then().statusCode(200);
    }
}
