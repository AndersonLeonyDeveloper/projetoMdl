package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Status derivado da taxa (adimplente, a vencer, em atraso) e seu efeito nos resumos — seção 7.10 de
 * sugestoes-de-testes.md e regras-de-negocio.md, seção 4.1. O valor gravado (`situacao`) continua
 * adimplente/inadimplente; só a exibição e os resumos distinguem "a vencer" de "em atraso".
 */
class StatusDaTaxaApiTest extends ApiBase {

    private static String admin;
    private static Map<String, Object> original;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        original = lerConfiguracao(admin);
        salvarConfiguracao(admin, 2, 1, 10);
    }

    @AfterAll
    static void restaurar() {
        salvarConfiguracao(admin,
            ((Number) original.get("multa_percentual")).doubleValue(),
            ((Number) original.get("juros_mensal_percentual")).doubleValue(),
            ((Number) original.get("dia_vencimento")).intValue());
    }

    /** Cria uma taxa de R$ 300,00 em aberto num apartamento aleatório; devolve {id, apartamento_id}. */
    private static int[] novaTaxa(int ano, int mes) {
        for (int tentativa = 0; tentativa < 30; tentativa++) {
            int apto = ThreadLocalRandom.current().nextInt(1, 193);
            var resposta = como(admin).contentType(ContentType.JSON)
                .body(Map.of("apartamento_id", apto, "mes_referencia", mes, "ano_referencia", ano, "valor", 300))
                .when().post("/financeiro/taxas");
            if (resposta.statusCode() == 409) continue;
            resposta.then().statusCode(201);
            return new int[] {resposta.path("id"), apto};
        }
        throw new AssertionError("sem apartamento livre em " + mes + "/" + ano);
    }

    private static Map<String, Object> taxa(int ano, int mes, int id) {
        List<Map<String, Object>> linhas = como(admin).queryParam("ano", ano).queryParam("mes", mes)
            .when().get("/financeiro/taxas").then().statusCode(200).extract().jsonPath()
            .getList("findAll { it.id == " + id + " }");
        return linhas.get(0);
    }

    private static double somaDoBloco(int ano, int mes, String campo) {
        return como(admin).queryParam("ano", ano).queryParam("mes", mes)
            .when().get("/financeiro/resumo/blocos").then().statusCode(200).extract().jsonPath().getDouble("sum { it." + campo + " }");
    }

    @Test
    @DisplayName("Toda taxa traz status coerente com a situação gravada")
    void statusCoerente() {
        List<Map<String, Object>> taxas = como(admin).queryParam("ano", 2023).queryParam("mes", 5)
            .when().get("/financeiro/taxas").then().statusCode(200).extract().jsonPath().getList("$");
        org.junit.jupiter.api.Assertions.assertFalse(taxas.isEmpty());
        for (Map<String, Object> t : taxas) {
            String situacao = (String) t.get("situacao");
            String status = (String) t.get("status");
            if ("adimplente".equals(situacao)) org.junit.jupiter.api.Assertions.assertEquals("adimplente", status);
            else org.junit.jupiter.api.Assertions.assertTrue(List.of("a_vencer", "em_atraso").contains(status), status);
        }
    }

    @Test
    @DisplayName("Em aberto de mês passado = em atraso; de mês futuro = a vencer; paga = adimplente")
    void passadoFuturoPago() {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        int[] antiga = novaTaxa(ano, 4);
        org.junit.jupiter.api.Assertions.assertEquals("em_atraso", taxa(ano, 4, antiga[0]).get("status"));

        int[] futura = novaTaxa(2900, 4);
        org.junit.jupiter.api.Assertions.assertEquals("a_vencer", taxa(2900, 4, futura[0]).get("status"));

        como(admin).multiPart("data_pagamento", ano + "-04-20")
            .when().put("/financeiro/taxas/" + antiga[0] + "/pagamento").then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals("adimplente", taxa(ano, 4, antiga[0]).get("status"));
        org.junit.jupiter.api.Assertions.assertEquals("inadimplente", taxa(2900, 4, futura[0]).get("situacao"));
    }

    @Test
    @DisplayName("Valor-limite: com vencimento hoje a taxa do mês ainda é a vencer; no dia anterior, é em atraso")
    void vencimentoNoDiaDeHoje() {
        LocalDate hoje = LocalDate.now();
        Assumptions.assumeTrue(hoje.getDayOfMonth() >= 2 && hoje.getDayOfMonth() <= 28, "só roda entre os dias 2 e 28");
        int ano = hoje.getYear();
        int mes = hoje.getMonthValue();
        List<Map<String, Object>> abertas = como(admin).queryParam("ano", ano).queryParam("mes", mes)
            .when().get("/financeiro/taxas").then().extract().jsonPath().getList("findAll { it.situacao == 'inadimplente' }");
        int id = abertas.isEmpty() ? novaTaxa(ano, mes)[0] : ((Number) abertas.get(0).get("id")).intValue();
        try {
            salvarConfiguracao(admin, 2, 1, hoje.getDayOfMonth());
            org.junit.jupiter.api.Assertions.assertEquals("a_vencer", taxa(ano, mes, id).get("status"));
            salvarConfiguracao(admin, 2, 1, hoje.getDayOfMonth() - 1);
            org.junit.jupiter.api.Assertions.assertEquals("em_atraso", taxa(ano, mes, id).get("status"));
        } finally {
            salvarConfiguracao(admin, 2, 1, 10);
        }
    }

    @Test
    @DisplayName("Resumo por bloco separa em atraso de a vencer (futuro não é inadimplente)")
    void resumoPorBloco() {
        novaTaxa(2900, 7);
        org.junit.jupiter.api.Assertions.assertEquals(300.0, somaDoBloco(2900, 7, "a_vencer"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(0.0, somaDoBloco(2900, 7, "inadimplente"), 0.001);

        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        novaTaxa(ano, 7);
        org.junit.jupiter.api.Assertions.assertEquals(300.0, somaDoBloco(ano, 7, "inadimplente"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(0.0, somaDoBloco(ano, 7, "a_vencer"), 0.001);
    }

    @Test
    @DisplayName("Histórico do seed não tem nada a vencer; a inadimplência anual e a evolução trazem o campo novo")
    void historicoSemAVencer() {
        como(admin).queryParam("ano", 2023).queryParam("mes", 5).when().get("/financeiro/resumo/blocos")
            .then().statusCode(200).body("sum { it.a_vencer }", numero(0.0));
        como(admin).queryParam("ano", 2023).when().get("/financeiro/resumo/inadimplencia")
            .then().statusCode(200).body("sum { it.a_vencer }", numero(0.0));
        como(admin).queryParam("ano_inicio", 2020).queryParam("ano_fim", 2025).when().get("/financeiro/resumo/evolucao")
            .then().statusCode(200).body("sum { it.a_vencer }", equalTo(0));
    }

    @Test
    @DisplayName("Inadimplência anual e evolução: taxa de mês futuro não conta como inadimplente nem como em aberto")
    void futuroForaDaInadimplencia() {
        novaTaxa(2900, 9);
        como(admin).queryParam("ano", 2900).when().get("/financeiro/resumo/inadimplencia")
            .then().statusCode(200)
            .body("find { it.mes_referencia == 9 }.inadimplente", numero(0.0))
            .body("find { it.mes_referencia == 9 }.a_vencer", numero(300.0));
        como(admin).queryParam("ano_inicio", 2900).queryParam("ano_fim", 2900).when().get("/financeiro/resumo/evolucao")
            .then().statusCode(200)
            .body("find { it.mes == 9 }.em_aberto", equalTo(0))
            .body("find { it.mes == 9 }.atrasadas", equalTo(0))
            .body("find { it.mes == 9 }.a_vencer", org.hamcrest.Matchers.greaterThanOrEqualTo(1));
    }
}
