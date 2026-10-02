package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Aviso de juros diferente do cálculo e "Recalcular juros" — seção 7.11 de sugestoes-de-testes.md e
 * regras-de-negocio.md, seção 4.1.1. Os testes assumem multa 2%, juros 1% e vencimento dia 10 e restauram a configuração.
 */
class RecalcularJurosApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;
    private static Map<String, Object> original;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
        original = lerConfiguracao(admin);
    }

    @BeforeEach
    void padroes() {
        salvarConfiguracao(admin, 2, 1, 10);
    }

    @AfterAll
    static void restaurar() {
        salvarConfiguracao(admin,
            ((Number) original.get("multa_percentual")).doubleValue(),
            ((Number) original.get("juros_mensal_percentual")).doubleValue(),
            ((Number) original.get("dia_vencimento")).intValue());
    }

    /** Taxa de R$ 325,00 de janeiro de um ano passado aleatório, paga com 10 dias de atraso (juros calculado = 7,58). */
    private static int[] taxaPaga(String jurosManual) {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        int id = como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", ThreadLocalRandom.current().nextInt(1, 193),
                "mes_referencia", 1, "ano_referencia", ano, "valor", 325))
            .when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        var pagamento = como(admin).multiPart("data_pagamento", ano + "-01-20");
        if (jurosManual != null) pagamento = pagamento.multiPart("juros", jurosManual);
        pagamento.when().put("/financeiro/taxas/" + id + "/pagamento").then().statusCode(200);
        return new int[] {id, ano};
    }

    private static Map<String, Object> taxa(int[] t) {
        List<Map<String, Object>> linhas = como(admin).queryParam("ano", t[1]).queryParam("mes", 1)
            .when().get("/financeiro/taxas").then().extract().jsonPath().getList("findAll { it.id == " + t[0] + " }");
        return linhas.get(0);
    }

    private static double numero(Map<String, Object> m, String campo) {
        return ((Number) m.get(campo)).doubleValue();
    }

    @Test
    @DisplayName("Taxa paga com o cálculo normal não diverge; taxa em aberto não tem juros calculado")
    void semDivergencia() {
        int[] t = taxaPaga(null);
        Map<String, Object> paga = taxa(t);
        org.junit.jupiter.api.Assertions.assertEquals(7.58, numero(paga, "juros_calculado"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(false, paga.get("juros_diverge"));

        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        int idAberta = como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", ThreadLocalRandom.current().nextInt(1, 193),
                "mes_referencia", 2, "ano_referencia", ano, "valor", 325))
            .when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        Map<String, Object> aberta = como(admin).queryParam("ano", ano).queryParam("mes", 2)
            .when().get("/financeiro/taxas").then().extract().jsonPath()
            .<Map<String, Object>>getList("findAll { it.id == " + idAberta + " }").get(0);
        org.junit.jupiter.api.Assertions.assertNull(aberta.get("juros_calculado"));
        org.junit.jupiter.api.Assertions.assertEquals(false, aberta.get("juros_diverge"));
    }

    @Test
    @DisplayName("Juros ajustado à mão diverge; recalcular regrava o cálculo e remove o aviso")
    void ajusteManualERecalculo() {
        int[] t = taxaPaga("1.50");
        Map<String, Object> antes = taxa(t);
        org.junit.jupiter.api.Assertions.assertEquals(true, antes.get("juros_diverge"));
        org.junit.jupiter.api.Assertions.assertEquals(1.5, numero(antes, "juros"), 0.001);

        como(admin).when().post("/financeiro/taxas/" + t[0] + "/recalcular-juros")
            .then().statusCode(200)
            .body("juros_anterior", numero(1.5)).body("juros", numero(7.58)).body("total", numero(332.58));

        Map<String, Object> depois = taxa(t);
        org.junit.jupiter.api.Assertions.assertEquals(7.58, numero(depois, "juros"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(false, depois.get("juros_diverge"));
    }

    @Test
    @DisplayName("Corrigir o valor não recalcula o juros (marca divergência); recalcular acompanha o novo valor")
    void corrigirValorMarcaDivergencia() {
        int[] t = taxaPaga(null);
        como(admin).contentType(ContentType.JSON).body(Map.of("valor", 425))
            .when().put("/financeiro/taxas/" + t[0]).then().statusCode(200);
        Map<String, Object> corrigida = taxa(t);
        org.junit.jupiter.api.Assertions.assertEquals(7.58, numero(corrigida, "juros"), 0.001, "juros gravado fica");
        org.junit.jupiter.api.Assertions.assertEquals(true, corrigida.get("juros_diverge"));

        como(admin).when().post("/financeiro/taxas/" + t[0] + "/recalcular-juros").then().statusCode(200);
        Map<String, Object> recalculada = taxa(t);
        // 425 × (0,02 + 0,01 × 10/30) = 9,92
        org.junit.jupiter.api.Assertions.assertEquals(9.92, numero(recalculada, "juros"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(false, recalculada.get("juros_diverge"));
    }

    @Test
    @DisplayName("Mudar os percentuais faz as taxas já pagas com atraso divergirem; recalcular usa os percentuais atuais")
    void mudarPercentuais() {
        int[] t = taxaPaga(null);
        salvarConfiguracao(admin, 2, 5, 10);
        org.junit.jupiter.api.Assertions.assertEquals(true, taxa(t).get("juros_diverge"));
        como(admin).when().post("/financeiro/taxas/" + t[0] + "/recalcular-juros").then().statusCode(200);
        // 325 × (0,02 + 0,05 × 10/30) = 11,92
        org.junit.jupiter.api.Assertions.assertEquals(11.92, numero(taxa(t), "juros"), 0.001);
    }

    @Test
    @DisplayName("Taxa em aberto retorna 400; inexistente 404; morador 403; sem token 401")
    void erros() {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        int idAberta = como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", ThreadLocalRandom.current().nextInt(1, 193),
                "mes_referencia", 3, "ano_referencia", ano, "valor", 325))
            .when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        como(admin).when().post("/financeiro/taxas/" + idAberta + "/recalcular-juros").then().statusCode(400);
        como(admin).when().post("/financeiro/taxas/99999999/recalcular-juros").then().statusCode(404);

        int[] paga = taxaPaga(null);
        como(proprietario).when().post("/financeiro/taxas/" + paga[0] + "/recalcular-juros").then().statusCode(403);
        semLogin().when().post("/financeiro/taxas/" + paga[0] + "/recalcular-juros").then().statusCode(401);
    }
}
