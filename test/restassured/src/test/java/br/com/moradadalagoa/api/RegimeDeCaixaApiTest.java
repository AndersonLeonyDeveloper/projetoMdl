package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Resumo mensal por regime (`GET /financeiro/resumo/mensal?regime=competencia|caixa`) — seção 7.16 de
 * sugestoes-de-testes.md e regras-de-negocio.md, seção 4.4. Competência: taxas no mês de referência. Caixa: no mês do pagamento.
 */
class RegimeDeCaixaApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
    }

    private static double receitas(String token, int ano, int mes, String regime) {
        var req = como(token).queryParam("ano", ano).queryParam("mes", mes);
        if (regime != null) req = req.queryParam("regime", regime);
        return req.when().get("/financeiro/resumo/mensal").then().statusCode(200).extract().jsonPath().getDouble("receitas");
    }

    private static double despesas(int ano, int mes, String regime) {
        return como(admin).queryParam("ano", ano).queryParam("mes", mes).queryParam("regime", regime)
            .when().get("/financeiro/resumo/mensal").then().statusCode(200).extract().jsonPath().getDouble("despesas");
    }

    @Test
    @DisplayName("Sem regime vale a competência, e a resposta informa o regime usado")
    void padraoECompetencia() {
        como(admin).queryParam("ano", 2023).queryParam("mes", 5).when().get("/financeiro/resumo/mensal")
            .then().statusCode(200).body("regime", equalTo("competencia"));
        como(admin).queryParam("ano", 2023).queryParam("mes", 5).queryParam("regime", "caixa").when().get("/financeiro/resumo/mensal")
            .then().statusCode(200).body("regime", equalTo("caixa"));
        org.junit.jupiter.api.Assertions.assertEquals(receitas(admin, 2023, 5, null), receitas(admin, 2023, 5, "competencia"), 0.001);
    }

    @Test
    @DisplayName("Regime inválido retorna 400; sem ano ou mês continua 400")
    void validacao() {
        como(admin).queryParam("ano", 2023).queryParam("mes", 5).queryParam("regime", "xpto")
            .when().get("/financeiro/resumo/mensal").then().statusCode(400);
        como(admin).queryParam("regime", "caixa").when().get("/financeiro/resumo/mensal").then().statusCode(400);
    }

    @Test
    @DisplayName("Os dois regimes diferem nos meses com atraso pago depois (seed), mas as despesas são iguais")
    void regimesDiferem() {
        org.junit.jupiter.api.Assertions.assertNotEquals(
            receitas(admin, 2023, 5, "competencia"), receitas(admin, 2023, 5, "caixa"), "atrasos pagos em outro mês mudam o caixa");
        org.junit.jupiter.api.Assertions.assertEquals(despesas(2023, 5, "competencia"), despesas(2023, 5, "caixa"), 0.001);
    }

    @Test
    @DisplayName("Pagar uma taxa em outro mês move a receita: sobe a competência do mês de referência e o caixa do mês do pagamento")
    void pagamentoTardioMoveAReceita() {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        int id = como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", ThreadLocalRandom.current().nextInt(1, 193), "mes_referencia", 1, "ano_referencia", ano, "valor", 300))
            .when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        double compJan = receitas(admin, ano, 1, "competencia");
        double caixaJan = receitas(admin, ano, 1, "caixa");
        double compMar = receitas(admin, ano, 3, "competencia");
        double caixaMar = receitas(admin, ano, 3, "caixa");

        como(admin).multiPart("data_pagamento", ano + "-03-15").multiPart("juros", "0")
            .when().put("/financeiro/taxas/" + id + "/pagamento").then().statusCode(200);

        org.junit.jupiter.api.Assertions.assertEquals(compJan + 300, receitas(admin, ano, 1, "competencia"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(caixaJan, receitas(admin, ano, 1, "caixa"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(compMar, receitas(admin, ano, 3, "competencia"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(caixaMar + 300, receitas(admin, ano, 3, "caixa"), 0.001);
    }

    @Test
    @DisplayName("De 2020 a 2026 a soma das receitas é a mesma nos dois regimes (só muda em que mês cada uma cai)")
    void totalConvergeNoPeriodo() {
        double competencia = 0;
        double caixa = 0;
        for (int ano = 2020; ano <= 2026; ano++) {
            for (int mes = 1; mes <= 12; mes++) {
                competencia += receitas(admin, ano, mes, "competencia");
                caixa += receitas(admin, ano, mes, "caixa");
            }
        }
        org.junit.jupiter.api.Assertions.assertEquals(competencia, caixa, 0.5);
    }

    @Test
    @DisplayName("Despesa cancelada sai dos dois regimes")
    void canceladoSaiDosDoisRegimes() {
        int id = como(admin).contentType(ContentType.JSON)
            .body(Map.of("descricao", "Caixa " + UUID.randomUUID(), "valor", 80, "data", "2030-03-20"))
            .when().post("/financeiro/despesas").then().statusCode(201).extract().path("id");
        double comp = despesas(2030, 3, "competencia");
        double cx = despesas(2030, 3, "caixa");
        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "Teste de regimes"))
            .when().post("/financeiro/despesas/" + id + "/cancelar").then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(comp - 80, despesas(2030, 3, "competencia"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(cx - 80, despesas(2030, 3, "caixa"), 0.001);
    }

    @Test
    @DisplayName("Morador também consulta os dois regimes; sem token, 401")
    void acesso() {
        org.junit.jupiter.api.Assertions.assertEquals(receitas(admin, 2023, 5, "caixa"), receitas(proprietario, 2023, 5, "caixa"), 0.001);
        semLogin().queryParam("ano", 2023).queryParam("mes", 5).queryParam("regime", "caixa")
            .when().get("/financeiro/resumo/mensal").then().statusCode(401);
    }
}
