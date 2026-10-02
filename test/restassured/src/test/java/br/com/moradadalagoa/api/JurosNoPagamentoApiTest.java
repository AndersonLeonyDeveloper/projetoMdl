package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Multa e juros por atraso, calculados pelo sistema ao registrar o pagamento — seção 7.5 de sugestoes-de-testes.md
 * e regra em regras-de-negocio.md, seção 4.1.1:
 * juros = valor × (multa% + juros% ao mês × dias / 30), arredondado a 2 casas, vencimento no dia configurado do mês de referência.
 * Os testes assumem os padrões (multa 2%, juros 1%, vencimento dia 10) e restauram a configuração ao final.
 */
class JurosNoPagamentoApiTest extends ApiBase {

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

    /** Cria uma taxa de R$ 325,00 em janeiro de um ano futuro aleatório; devolve {id, ano}. */
    private static int[] novaTaxa() {
        int ano = ThreadLocalRandom.current().nextInt(2100, 2900);
        int id = como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", ThreadLocalRandom.current().nextInt(1, 193),
                "mes_referencia", 1, "ano_referencia", ano, "valor", 325))
            .when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        return new int[] {id, ano};
    }

    private static Response previa(int id, String data) {
        return como(admin).queryParam("data_pagamento", data).when().get("/financeiro/taxas/" + id + "/calculo-juros");
    }

    private static Response pagar(int id, String data, String jurosManual) {
        var req = como(admin).multiPart("data_pagamento", data);
        if (jurosManual != null) req = req.multiPart("juros", jurosManual);
        return req.when().put("/financeiro/taxas/" + id + "/pagamento");
    }

    private static Map<String, Object> taxa(int id, int ano) {
        List<Map<String, Object>> linhas = como(admin).queryParam("ano", ano)
            .when().get("/financeiro/taxas").then().extract().jsonPath().getList("findAll { it.id == " + id + " }");
        return linhas.get(0);
    }

    @Test
    @DisplayName("Sem atraso: pagar no dia do vencimento (ou antes) resulta em juros 0")
    void semAtraso() {
        int[] t = novaTaxa();
        previa(t[0], t[1] + "-01-10").then().statusCode(200)
            .body("dias_em_atraso", equalTo(0)).body("juros", numero(0.0)).body("total", numero(325.0));
        previa(t[0], t[1] + "-01-02").then().body("dias_em_atraso", equalTo(0)).body("juros", numero(0.0));
    }

    @Test
    @DisplayName("Valor-limite: dia 11 já é 1 dia de atraso, com multa de 2% e 1/30 do juros mensal")
    void primeiroDiaDeAtraso() {
        int[] t = novaTaxa();
        previa(t[0], t[1] + "-01-11").then().statusCode(200)
            .body("dias_em_atraso", equalTo(1)).body("multa", numero(6.5))
            .body("juros", numero(6.61)).body("total", numero(331.61));
    }

    @Test
    @DisplayName("Fórmula: R$ 325,00 com 10 dias de atraso = juros de R$ 7,58 e total de R$ 332,58")
    void formula() {
        int[] t = novaTaxa();
        previa(t[0], t[1] + "-01-20").then().statusCode(200)
            .body("vencimento", equalTo(t[1] + "-01-10")).body("dias_em_atraso", equalTo(10))
            .body("juros", numero(7.58)).body("total", numero(332.58));
    }

    @Test
    @DisplayName("Arredondamento: meio centavo (R$ 8,125) arredonda para cima (R$ 8,13)")
    void arredondamento() {
        int[] t = novaTaxa();
        previa(t[0], t[1] + "-01-25").then().statusCode(200)
            .body("dias_em_atraso", equalTo(15)).body("juros", numero(8.13));
    }

    @Test
    @DisplayName("O vencimento é o do mês de referência, mesmo pagando meses depois")
    void pagamentoEmOutroMes() {
        int[] t = novaTaxa();
        long esperado = ChronoUnit.DAYS.between(LocalDate.of(t[1], 1, 10), LocalDate.of(t[1], 3, 1));
        previa(t[0], t[1] + "-03-01").then().statusCode(200).body("dias_em_atraso", equalTo((int) esperado));
    }

    @Test
    @DisplayName("Pagamento calcula e grava o juros; a taxa fica adimplente")
    void pagamentoGravaOJuros() {
        int[] t = novaTaxa();
        pagar(t[0], t[1] + "-01-20", null).then().statusCode(200).body("juros", numero(7.58));
        Map<String, Object> gravada = taxa(t[0], t[1]);
        org.junit.jupiter.api.Assertions.assertEquals(7.58, ((Number) gravada.get("juros")).doubleValue());
        org.junit.jupiter.api.Assertions.assertEquals("adimplente", gravada.get("situacao"));
        org.junit.jupiter.api.Assertions.assertEquals(t[1] + "-01-20", gravada.get("data_pagamento"));
    }

    @Test
    @DisplayName("Ajuste manual prevalece sobre o cálculo, inclusive juros 0 (acordo)")
    void ajusteManual() {
        int[] t = novaTaxa();
        pagar(t[0], t[1] + "-03-01", "0").then().statusCode(200).body("juros", numero(0.0));
        org.junit.jupiter.api.Assertions.assertEquals(0.0, ((Number) taxa(t[0], t[1]).get("juros")).doubleValue());

        int[] u = novaTaxa();
        pagar(u[0], u[1] + "-03-01", "12.34").then().statusCode(200).body("juros", numero(12.34));
    }

    @Test
    @DisplayName("Mudar os percentuais ou o vencimento não recalcula pagamentos já registrados")
    void historicoPreservado() {
        int[] t = novaTaxa();
        pagar(t[0], t[1] + "-01-20", null).then().statusCode(200);
        salvarConfiguracao(admin, 1, 5, 5);
        org.junit.jupiter.api.Assertions.assertEquals(7.58, ((Number) taxa(t[0], t[1]).get("juros")).doubleValue());
    }

    @Test
    @DisplayName("Vencimento configurável: com dia 5, pagar no dia 10 são 5 dias de atraso")
    void vencimentoConfiguravel() {
        int[] t = novaTaxa();
        salvarConfiguracao(admin, 2, 1, 5);
        previa(t[0], t[1] + "-01-10").then().statusCode(200)
            .body("vencimento", equalTo(t[1] + "-01-05")).body("dias_em_atraso", equalTo(5));
    }

    @Test
    @DisplayName("Percentuais configuráveis entram no cálculo (multa 0%, juros 3% ao mês)")
    void percentuaisConfiguraveis() {
        int[] t = novaTaxa();
        salvarConfiguracao(admin, 0, 3, 10);
        // 325 × (0 + 3% × 30/30) = 9,75
        previa(t[0], t[1] + "-02-09").then().statusCode(200)
            .body("dias_em_atraso", equalTo(30)).body("juros", numero(9.75));
    }

    @Test
    @DisplayName("Data inválida retorna 400; data futura é aceita")
    void validacaoDaData() {
        int[] t = novaTaxa();
        previa(t[0], "2027-02-30").then().statusCode(400);
        previa(t[0], "ontem").then().statusCode(400);
        pagar(t[0], "31/01/2027", null).then().statusCode(400);
        pagar(t[0], t[1] + "-01-20", null).then().statusCode(200); // 2100+ é futuro
    }

    @Test
    @DisplayName("Taxa inexistente retorna 404; morador não acessa a prévia (403)")
    void inexistenteERbac() {
        como(admin).queryParam("data_pagamento", "2100-01-20")
            .when().get("/financeiro/taxas/99999999/calculo-juros").then().statusCode(404);
        int[] t = novaTaxa();
        como(proprietario).queryParam("data_pagamento", t[1] + "-01-20")
            .when().get("/financeiro/taxas/" + t[0] + "/calculo-juros").then().statusCode(403);
        semLogin().queryParam("data_pagamento", t[1] + "-01-20")
            .when().get("/financeiro/taxas/" + t[0] + "/calculo-juros").then().statusCode(401);
    }
}
