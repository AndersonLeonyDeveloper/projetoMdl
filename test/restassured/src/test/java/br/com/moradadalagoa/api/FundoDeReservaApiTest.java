package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Fundo de reserva (`GET /financeiro/fundo-reserva`, percentual por ano, saldo inicial e despesas "pagas pelo fundo") —
 * seção 7.20 de sugestoes-de-testes.md e regras-de-negocio.md, seção 4.13. Aporte = percentual do ano da taxa × valor
 * (sem juros) das taxas pagas, no mês do pagamento. Retirada = despesa marcada. Os testes comparam diferenças, restauram
 * o saldo inicial e deixam anos novos em taxa_padrao (não há como apagá-los).
 */
class FundoDeReservaApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;
    private static double saldoInicialOriginal;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
        saldoInicialOriginal = ((Number) lerConfiguracao(admin).get("fundo_saldo_inicial")).doubleValue();
    }

    @AfterAll
    static void restaurar() {
        salvarConfig(Map.of("fundo_saldo_inicial", saldoInicialOriginal));
    }

    private static Response salvarConfig(Object corpo) {
        return como(admin).contentType(ContentType.JSON).body(corpo).when().put("/financeiro/configuracoes");
    }

    private static Map<String, Object> fundo() {
        return como(admin).when().get("/financeiro/fundo-reserva").then().statusCode(200).extract().jsonPath().getMap("$");
    }

    private static double numero(Map<String, Object> m, String campo) {
        return ((Number) m.get(campo)).doubleValue();
    }

    private static int anoLivre() {
        return ThreadLocalRandom.current().nextInt(2100, 2900);
    }

    private static int novaTaxaPaga(int ano, double valor, String dataPagamento, String juros) {
        int id = como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", ThreadLocalRandom.current().nextInt(1, 193), "mes_referencia", 1, "ano_referencia", ano, "valor", valor))
            .when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        como(admin).multiPart("data_pagamento", dataPagamento).multiPart("juros", juros)
            .when().put("/financeiro/taxas/" + id + "/pagamento").then().statusCode(200);
        return id;
    }

    private static Response despesa(Object fundo, String data) {
        var corpo = new java.util.HashMap<String, Object>(Map.of("descricao", "Obra " + UUID.randomUUID(), "valor", 1000, "data", data));
        if (fundo != null) corpo.put("fundo_reserva", fundo);
        return como(admin).contentType(ContentType.JSON).body(corpo).when().post("/financeiro/despesas");
    }

    // ---------- Consistência do cálculo ----------

    @Test
    @DisplayName("Saldo atual = saldo inicial + aportes − retiradas, e os movimentos encadeiam o saldo acumulado")
    @SuppressWarnings("unchecked")
    void consistencia() {
        Map<String, Object> f = fundo();
        org.junit.jupiter.api.Assertions.assertEquals(
            numero(f, "saldo_inicial") + numero(f, "aportes_total") - numero(f, "retiradas_total"), numero(f, "saldo_atual"), 0.011);
        List<Map<String, Object>> movimentos = (List<Map<String, Object>>) f.get("movimentos");
        double saldo = numero(f, "saldo_inicial");
        for (Map<String, Object> m : movimentos) {
            saldo += numero(m, "aportes") - numero(m, "retiradas");
            org.junit.jupiter.api.Assertions.assertEquals(saldo, numero(m, "saldo"), 0.02);
        }
        if (!movimentos.isEmpty()) {
            org.junit.jupiter.api.Assertions.assertEquals(numero(f, "saldo_atual"), numero(movimentos.get(movimentos.size() - 1), "saldo"), 0.011);
        }
    }

    @Test
    @DisplayName("Seed: saldo inicial 50.000, 10% de 2020 a 2026, 11 obras pagas pelo fundo e saldo nunca negativo")
    @SuppressWarnings("unchecked")
    void seed() {
        Map<String, Object> f = fundo();
        org.junit.jupiter.api.Assumptions.assumeTrue(numero(f, "saldo_inicial") == 50000.0, "banco sem o seed do fundo");
        List<Map<String, Object>> percentuais = (List<Map<String, Object>>) f.get("percentuais");
        for (Map<String, Object> p : percentuais) {
            int ano = ((Number) p.get("ano")).intValue();
            if (ano >= 2020 && ano <= 2026) org.junit.jupiter.api.Assertions.assertEquals(10.0, numero(p, "percentual"), 0.001);
        }
        org.junit.jupiter.api.Assertions.assertTrue(((List<?>) f.get("obras")).size() >= 11);
        for (Map<String, Object> m : (List<Map<String, Object>>) f.get("movimentos")) {
            org.junit.jupiter.api.Assertions.assertTrue(numero(m, "saldo") >= 0, "saldo negativo em " + m);
        }
    }

    // ---------- Aportes ----------

    @Test
    @DisplayName("O aporte é o percentual do ano da taxa sobre o valor (sem juros), no mês do pagamento")
    @SuppressWarnings("unchecked")
    void aportePorPagamento() {
        int ano = anoLivre();
        salvarConfig(Map.of("taxas_padrao", List.of(Map.of("ano", ano, "valor", 300, "fundo_percentual", 20)))).then().statusCode(200);
        Map<String, Object> antes = fundo();
        novaTaxaPaga(ano, 1000, "2024-03-10", "50"); // valor 1000 + juros 50: aporta 20% de 1000, não de 1050
        Map<String, Object> depois = fundo();
        org.junit.jupiter.api.Assertions.assertEquals(200.0, numero(depois, "aportes_total") - numero(antes, "aportes_total"), 0.011);

        double marcoAntes = ((List<Map<String, Object>>) antes.get("movimentos")).stream()
            .filter(m -> ((Number) m.get("ano")).intValue() == 2024 && ((Number) m.get("mes")).intValue() == 3)
            .mapToDouble(m -> numero(m, "aportes")).sum();
        double marcoDepois = ((List<Map<String, Object>>) depois.get("movimentos")).stream()
            .filter(m -> ((Number) m.get("ano")).intValue() == 2024 && ((Number) m.get("mes")).intValue() == 3)
            .mapToDouble(m -> numero(m, "aportes")).sum();
        org.junit.jupiter.api.Assertions.assertEquals(200.0, marcoDepois - marcoAntes, 0.011, "cai no mês do pagamento, não no da referência");
    }

    @Test
    @DisplayName("Taxa de um ano sem valor configurado não gera aporte")
    void anoSemConfiguracao() {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1950);
        double antes = numero(fundo(), "aportes_total");
        novaTaxaPaga(ano, 1000, "2024-04-10", "0");
        org.junit.jupiter.api.Assertions.assertEquals(antes, numero(fundo(), "aportes_total"), 0.001);
    }

    // ---------- Percentual e saldo inicial ----------

    @Test
    @DisplayName("Percentual: 0 e 100 são aceitos; negativo, acima de 100 e texto retornam 400; ano novo sem percentual fica com 10%")
    @SuppressWarnings("unchecked")
    void percentual() {
        int ano = anoLivre();
        for (Object invalido : List.of(-1, 101, "abc")) {
            salvarConfig(Map.of("taxas_padrao", List.of(Map.of("ano", ano, "valor", 300, "fundo_percentual", invalido)))).then().statusCode(400);
        }
        salvarConfig(Map.of("taxas_padrao", List.of(Map.of("ano", ano, "valor", 300, "fundo_percentual", 0)))).then().statusCode(200);
        salvarConfig(Map.of("taxas_padrao", List.of(Map.of("ano", ano, "valor", 300, "fundo_percentual", 100)))).then().statusCode(200);

        int outro = anoLivre();
        Response r = salvarConfig(Map.of("taxas_padrao", List.of(Map.of("ano", outro, "valor", 300))));
        List<Map<String, Object>> anos = r.then().statusCode(200).extract().jsonPath().getList("taxas_padrao");
        double padrao = anos.stream().filter(a -> ((Number) a.get("ano")).intValue() == outro).mapToDouble(a -> numero(a, "fundo_percentual")).findFirst().orElse(-1);
        org.junit.jupiter.api.Assertions.assertEquals(10.0, padrao, 0.001);

        // ano existente sem percentual no corpo mantém o percentual que tinha
        salvarConfig(Map.of("taxas_padrao", List.of(Map.of("ano", outro, "valor", 301)))).then().statusCode(200);
        salvarConfig(Map.of("taxas_padrao", List.of(Map.of("ano", outro, "valor", 301, "fundo_percentual", 25)))).then().statusCode(200);
        List<Map<String, Object>> depois = salvarConfig(Map.of("taxas_padrao", List.of(Map.of("ano", outro, "valor", 302))))
            .then().statusCode(200).extract().jsonPath().getList("taxas_padrao");
        org.junit.jupiter.api.Assertions.assertEquals(25.0,
            depois.stream().filter(a -> ((Number) a.get("ano")).intValue() == outro).mapToDouble(a -> numero(a, "fundo_percentual")).findFirst().orElse(-1), 0.001);
    }

    @Test
    @DisplayName("Saldo inicial: valores negativos ou texto retornam 400; aumentar 10.000 soma 10.000 ao saldo atual")
    void saldoInicial() {
        salvarConfig(Map.of("fundo_saldo_inicial", -1)).then().statusCode(400);
        salvarConfig(Map.of("fundo_saldo_inicial", "x")).then().statusCode(400);
        double antes = numero(fundo(), "saldo_atual");
        salvarConfig(Map.of("fundo_saldo_inicial", saldoInicialOriginal + 10000)).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(antes + 10000, numero(fundo(), "saldo_atual"), 0.011);
        salvarConfig(Map.of("fundo_saldo_inicial", saldoInicialOriginal)).then().statusCode(200);
    }

    // ---------- Despesas pagas pelo fundo ----------

    @Test
    @DisplayName("Despesa marcada vira retirada e aparece nas obras; a não marcada não mexe no fundo")
    @SuppressWarnings("unchecked")
    void despesaMarcada() {
        double antes = numero(fundo(), "retiradas_total");
        int id = despesa(true, "2026-05-10").then().statusCode(201).extract().path("id");
        Map<String, Object> f = fundo();
        org.junit.jupiter.api.Assertions.assertEquals(1000.0, numero(f, "retiradas_total") - antes, 0.011);
        org.junit.jupiter.api.Assertions.assertTrue(((List<Map<String, Object>>) f.get("obras")).stream().anyMatch(o -> ((Number) o.get("id")).intValue() == id));
        despesa(null, "2026-05-10").then().statusCode(201);
        despesa(false, "2026-05-10").then().statusCode(201);
        org.junit.jupiter.api.Assertions.assertEquals(1000.0, numero(fundo(), "retiradas_total") - antes, 0.011);
    }

    @Test
    @DisplayName("Editar: sem o campo mantém a marca; false tira do fundo; valor inválido retorna 400")
    void edicao() {
        int id = despesa(true, "2026-05-10").then().statusCode(201).extract().path("id");
        double comMarca = numero(fundo(), "retiradas_total");
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", 1000, "data", "2026-05-10"))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(comMarca, numero(fundo(), "retiradas_total"), 0.001);
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", 1000, "data", "2026-05-10", "fundo_reserva", false))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(comMarca - 1000, numero(fundo(), "retiradas_total"), 0.011);
        despesa("talvez", "2026-05-10").then().statusCode(400);
    }

    @Test
    @DisplayName("Despesa cancelada sai do fundo e volta ao restaurar; despesa de data futura não entra")
    void canceladaEFutura() {
        int id = despesa(true, "2026-05-10").then().statusCode(201).extract().path("id");
        double comMarca = numero(fundo(), "retiradas_total");
        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "Teste do fundo"))
            .when().post("/financeiro/despesas/" + id + "/cancelar").then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(comMarca - 1000, numero(fundo(), "retiradas_total"), 0.011);
        como(admin).contentType(ContentType.JSON).body("{}").when().post("/financeiro/despesas/" + id + "/restaurar").then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(comMarca, numero(fundo(), "retiradas_total"), 0.011);

        despesa(true, "2999-01-10").then().statusCode(201);
        org.junit.jupiter.api.Assertions.assertEquals(comMarca, numero(fundo(), "retiradas_total"), 0.011);
    }

    @Test
    @DisplayName("Marcar a despesa como do fundo não muda o saldo do condomínio no mês")
    void saldoDoCondominioNaoMuda() {
        int id = despesa(false, "2026-05-11").then().statusCode(201).extract().path("id");
        double antes = como(admin).queryParam("ano", 2026).queryParam("mes", 5).when().get("/financeiro/resumo/mensal").then().extract().jsonPath().getDouble("saldo");
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", 1000, "data", "2026-05-11", "fundo_reserva", true))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);
        double depois = como(admin).queryParam("ano", 2026).queryParam("mes", 5).when().get("/financeiro/resumo/mensal").then().extract().jsonPath().getDouble("saldo");
        org.junit.jupiter.api.Assertions.assertEquals(antes, depois, 0.001);
    }

    // ---------- Acesso e histórico ----------

    @Test
    @DisplayName("Qualquer perfil logado consulta o fundo; sem token, 401")
    void acesso() {
        como(proprietario).when().get("/financeiro/fundo-reserva").then().statusCode(200).body("saldo_atual", org.hamcrest.Matchers.notNullValue());
        como(login(INQUILINO)).when().get("/financeiro/fundo-reserva").then().statusCode(200);
        semLogin().when().get("/financeiro/fundo-reserva").then().statusCode(401);
    }

    @Test
    @DisplayName("Marca do fundo, percentual e saldo inicial ficam no histórico de alterações")
    void historico() {
        int id = despesa(true, "2026-05-12").then().statusCode(201).extract().path("id");
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", 1000, "data", "2026-05-12", "fundo_reserva", false))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);
        como(admin).queryParam("entidade", "despesa").queryParam("entidade_id", id).queryParam("acao", "editar")
            .when().get("/financeiro/auditoria").then().statusCode(200)
            .body("itens[0].antes.fundo_reserva", equalTo(1)).body("itens[0].depois.fundo_reserva", equalTo(0));

        int ano = anoLivre();
        salvarConfig(Map.of("taxas_padrao", List.of(Map.of("ano", ano, "valor", 300, "fundo_percentual", 15)))).then().statusCode(200);
        como(admin).queryParam("entidade", "configuracao").when().get("/financeiro/auditoria").then().statusCode(200)
            .body("itens[0].depois.fundo_percentuais['" + ano + "']", numero(15));
    }
}
