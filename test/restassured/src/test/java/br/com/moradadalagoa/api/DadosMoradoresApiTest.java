package br.com.moradadalagoa.api;

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
 * Coluna "Mensalidades" de Dados dos Moradores (`GET /dados-moradores`, campo `taxas_em_atraso`) — seção 7.7 de
 * sugestoes-de-testes.md e regras-de-negocio.md, seção 4.9. Só o proprietário tem a lista (vazia = em dia); inquilino
 * e apartamento vazio trazem null. Conta só a taxa inadimplente já vencida (vencimento estritamente antes de hoje).
 * Os testes criam taxas que a API não apaga e restauram a configuração financeira ao final.
 */
class DadosMoradoresApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;
    private static Map<String, Object> original;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
        original = lerConfiguracao(admin);
    }

    @AfterAll
    static void restaurar() {
        salvarConfiguracao(admin,
            ((Number) original.get("multa_percentual")).doubleValue(),
            ((Number) original.get("juros_mensal_percentual")).doubleValue(),
            ((Number) original.get("dia_vencimento")).intValue());
    }

    // ---------- Helpers ----------

    private static List<Map<String, Object>> dados() {
        return como(admin).when().get("/dados-moradores").then().statusCode(200).extract().jsonPath().getList("$");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> atrasosDoProprietario(String bloco, String apartamento) {
        for (Map<String, Object> linha : dados()) {
            if (bloco.equals(linha.get("bloco")) && apartamento.equals(linha.get("apartamento"))
                && "proprietario".equals(linha.get("tipo"))) {
                return (List<Map<String, Object>>) linha.get("taxas_em_atraso");
            }
        }
        throw new AssertionError("apartamento " + bloco + "/" + apartamento + " sem proprietário");
    }

    private static boolean contem(List<Map<String, Object>> atrasos, int ano, int mes) {
        return atrasos.stream().anyMatch(t ->
            ((Number) t.get("ano_referencia")).intValue() == ano && ((Number) t.get("mes_referencia")).intValue() == mes);
    }

    /** Cria uma taxa em aberto num apartamento aleatório e devolve {id, bloco, apartamento} (como texto). */
    private static Object[] novaTaxa(int ano, int mes) {
        for (int tentativa = 0; tentativa < 30; tentativa++) {
            var resposta = como(admin).contentType(ContentType.JSON)
                .body(Map.of("apartamento_id", ThreadLocalRandom.current().nextInt(1, 193),
                    "mes_referencia", mes, "ano_referencia", ano, "valor", 300))
                .when().post("/financeiro/taxas");
            if (resposta.statusCode() == 409) continue; // já existe nesse apartamento/mês
            resposta.then().statusCode(201);
            int id = resposta.path("id");
            Map<String, Object> taxa = como(admin).queryParam("ano", ano).queryParam("mes", mes)
                .when().get("/financeiro/taxas").then().extract().jsonPath()
                .<Map<String, Object>>getList("findAll { it.id == " + id + " }").get(0);
            return new Object[] {id, taxa.get("bloco_numero"), taxa.get("apartamento_numero")};
        }
        throw new AssertionError("não foi possível criar uma taxa livre em " + mes + "/" + ano);
    }

    // ---------- Acesso e formato ----------

    @Test
    @DisplayName("Admin vê; morador recebe 403; sem token 401")
    void acesso() {
        como(admin).when().get("/dados-moradores").then().statusCode(200);
        como(proprietario).when().get("/dados-moradores").then().statusCode(403);
        como(login(INQUILINO)).when().get("/dados-moradores").then().statusCode(403);
        semLogin().when().get("/dados-moradores").then().statusCode(401);
    }

    @Test
    @DisplayName("Só o proprietário tem a lista (vazia = em dia); inquilino e apartamento vazio têm null")
    void formatoPorTipo() {
        List<Map<String, Object>> linhas = dados();
        org.junit.jupiter.api.Assertions.assertFalse(linhas.isEmpty());
        for (Map<String, Object> linha : linhas) {
            Object atrasos = linha.get("taxas_em_atraso");
            if ("proprietario".equals(linha.get("tipo"))) {
                org.junit.jupiter.api.Assertions.assertTrue(atrasos instanceof List, "proprietário deve ter lista");
            } else {
                org.junit.jupiter.api.Assertions.assertNull(atrasos, "inquilino/vazio deve ter null: " + linha);
            }
        }
    }

    // ---------- Regra de atraso ----------

    @Test
    @DisplayName("Taxa antiga em aberto conta; taxa futura não; a lista vem do mais antigo ao mais recente")
    void antigaContaFuturaNao() {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        Object[] maio = novaTaxa(ano, 5);
        String bloco = (String) maio[1];
        String apto = (String) maio[2];
        // Mais uma taxa antiga (fevereiro) e uma futura no MESMO apartamento, descoberto pelo id da taxa de maio.
        int aptoId = como(admin).queryParam("ano", ano).queryParam("mes", 5)
            .when().get("/financeiro/taxas").then().extract().jsonPath()
            .getInt("find { it.id == " + maio[0] + " }.apartamento_id");
        como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", aptoId, "mes_referencia", 2, "ano_referencia", ano, "valor", 300))
            .when().post("/financeiro/taxas").then().statusCode(201);
        como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", aptoId, "mes_referencia", 1, "ano_referencia", 2900, "valor", 300))
            .when().post("/financeiro/taxas").then().statusCode(201); // futura

        List<Map<String, Object>> atrasos = atrasosDoProprietario(bloco, apto);
        org.junit.jupiter.api.Assertions.assertTrue(contem(atrasos, ano, 2));
        org.junit.jupiter.api.Assertions.assertTrue(contem(atrasos, ano, 5));
        org.junit.jupiter.api.Assertions.assertFalse(contem(atrasos, 2900, 1), "taxa futura não é atraso");

        int posFev = indice(atrasos, ano, 2);
        int posMai = indice(atrasos, ano, 5);
        org.junit.jupiter.api.Assertions.assertTrue(posFev < posMai, "ordem do mais antigo ao mais recente");
    }

    private static int indice(List<Map<String, Object>> atrasos, int ano, int mes) {
        for (int i = 0; i < atrasos.size(); i++) {
            Map<String, Object> t = atrasos.get(i);
            if (((Number) t.get("ano_referencia")).intValue() == ano && ((Number) t.get("mes_referencia")).intValue() == mes) return i;
        }
        return -1;
    }

    @Test
    @DisplayName("Pagar a taxa tira o mês da lista; taxa paga em atraso não conta")
    void pagarTiraDaLista() {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        Object[] taxa = novaTaxa(ano, 3);
        String bloco = (String) taxa[1];
        String apto = (String) taxa[2];
        org.junit.jupiter.api.Assertions.assertTrue(contem(atrasosDoProprietario(bloco, apto), ano, 3));

        como(admin).multiPart("data_pagamento", ano + "-03-25")
            .when().put("/financeiro/taxas/" + taxa[0] + "/pagamento").then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertFalse(contem(atrasosDoProprietario(bloco, apto), ano, 3));
    }

    @Test
    @DisplayName("Valor-limite: com vencimento no dia de hoje a taxa do mês ainda não é atraso; no dia anterior, é")
    void vencimentoNoDiaDeHoje() {
        LocalDate hoje = LocalDate.now();
        // O vencimento só pode estar entre os dias 1 e 28, e o teste precisa de "ontem" dentro do mês.
        Assumptions.assumeTrue(hoje.getDayOfMonth() >= 2 && hoje.getDayOfMonth() <= 28,
            "só roda entre os dias 2 e 28 do mês");

        int ano = hoje.getYear();
        int mes = hoje.getMonthValue();
        // Taxa em aberto do mês atual: usa uma existente (ex.: geradas pela tela) ou cria uma.
        List<Map<String, Object>> doMes = como(admin).queryParam("ano", ano).queryParam("mes", mes)
            .when().get("/financeiro/taxas").then().extract().jsonPath()
            .getList("findAll { it.situacao == 'inadimplente' }");
        String bloco;
        String apto;
        if (doMes.isEmpty()) {
            Object[] criada = novaTaxa(ano, mes);
            bloco = (String) criada[1];
            apto = (String) criada[2];
        } else {
            bloco = (String) doMes.get(0).get("bloco_numero");
            apto = (String) doMes.get(0).get("apartamento_numero");
        }

        try {
            salvarConfiguracao(admin, 2, 1, hoje.getDayOfMonth());
            org.junit.jupiter.api.Assertions.assertFalse(contem(atrasosDoProprietario(bloco, apto), ano, mes),
                "vencimento = hoje: ainda não é atraso");
            salvarConfiguracao(admin, 2, 1, hoje.getDayOfMonth() - 1);
            org.junit.jupiter.api.Assertions.assertTrue(contem(atrasosDoProprietario(bloco, apto), ano, mes),
                "vencimento = ontem: já é atraso");
        } finally {
            restaurar();
        }
    }

    @Test
    @DisplayName("A soma das mensalidades em atraso nunca passa do total de taxas inadimplentes")
    void totalConsistenteComAsTaxas() {
        int somaNaTela = 0;
        for (Map<String, Object> linha : dados()) {
            Object atrasos = linha.get("taxas_em_atraso");
            if (atrasos instanceof List<?> lista) somaNaTela += lista.size();
        }
        int abertas = como(admin).when().get("/financeiro/taxas").then().extract().jsonPath()
            .getInt("findAll { it.situacao == 'inadimplente' }.size()");
        org.junit.jupiter.api.Assertions.assertTrue(somaNaTela <= abertas,
            "em atraso (" + somaNaTela + ") não pode passar das inadimplentes (" + abertas + ")");
        como(admin).when().get("/dados-moradores").then().body("size()", org.hamcrest.Matchers.greaterThan(0));
    }

    // ---------- Valor devido, juros até hoje e link para a taxa ----------

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> todosOsItensEmAtraso() {
        List<Map<String, Object>> itens = new java.util.ArrayList<>();
        for (Map<String, Object> linha : dados()) {
            Object atrasos = linha.get("taxas_em_atraso");
            if (atrasos instanceof List<?> lista) {
                for (Object item : lista) {
                    Map<String, Object> copia = new java.util.HashMap<>((Map<String, Object>) item);
                    copia.put("apartamento_id", linha.get("apartamento_id"));
                    itens.add(copia);
                }
            }
        }
        return itens;
    }

    private static double numero(Map<String, Object> m, String campo) {
        return ((Number) m.get(campo)).doubleValue();
    }

    @Test
    @DisplayName("Cada mês em atraso traz id, valor, dias, juros e total (total = valor + juros) e a linha traz apartamento_id")
    void camposDoValorDevido() {
        List<Map<String, Object>> linhas = dados();
        for (Map<String, Object> linha : linhas) {
            org.junit.jupiter.api.Assertions.assertTrue(linha.get("apartamento_id") instanceof Number, "apartamento_id");
        }
        List<Map<String, Object>> itens = todosOsItensEmAtraso();
        Assumptions.assumeFalse(itens.isEmpty(), "sem mensalidades em atraso no banco");
        for (Map<String, Object> item : itens) {
            for (String campo : List.of("id", "mes_referencia", "ano_referencia", "valor", "dias_em_atraso", "juros", "total")) {
                org.junit.jupiter.api.Assertions.assertNotNull(item.get(campo), campo);
            }
            org.junit.jupiter.api.Assertions.assertTrue(numero(item, "dias_em_atraso") > 0);
            org.junit.jupiter.api.Assertions.assertEquals(numero(item, "valor") + numero(item, "juros"), numero(item, "total"), 0.006);
        }
    }

    @Test
    @DisplayName("O juros estimado é o mesmo da prévia de pagamento de hoje (mesma fórmula)")
    void jurosIgualAPreviaDeHoje() {
        List<Map<String, Object>> itens = todosOsItensEmAtraso();
        Assumptions.assumeFalse(itens.isEmpty(), "sem mensalidades em atraso no banco");
        int passo = Math.max(1, itens.size() / 10); // amostra de ~10 itens
        for (int i = 0; i < itens.size(); i += passo) {
            Map<String, Object> item = itens.get(i);
            como(admin).queryParam("data_pagamento", LocalDate.now().toString())
                .when().get("/financeiro/taxas/" + item.get("id") + "/calculo-juros")
                .then().statusCode(200)
                .body("dias_em_atraso", org.hamcrest.Matchers.equalTo(((Number) item.get("dias_em_atraso")).intValue()))
                .body("juros", numero(((Number) item.get("juros")).doubleValue()))
                .body("total", numero(((Number) item.get("total")).doubleValue()));
        }
    }

    @Test
    @DisplayName("Mudar multa e juros muda o estimado; pagar a taxa tira o mês da lista e reduz o total")
    void configuracaoEPagamentoMudamOValor() {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        Object[] taxa = novaTaxa(ano, 7);
        int id = (Integer) taxa[0];
        String bloco = (String) taxa[1];
        String apto = (String) taxa[2];

        try {
            salvarConfiguracao(admin, 2, 1, 10);
            double padrao = jurosDe(bloco, apto, id);
            salvarConfiguracao(admin, 0, 3, 10);
            double alterado = jurosDe(bloco, apto, id);
            org.junit.jupiter.api.Assertions.assertNotEquals(padrao, alterado, "juros estimado deve acompanhar a configuração");
        } finally {
            restaurar();
        }

        double totalAntes = totalDevido(bloco, apto);
        como(admin).multiPart("data_pagamento", ano + "-07-20")
            .when().put("/financeiro/taxas/" + id + "/pagamento").then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertTrue(totalDevido(bloco, apto) < totalAntes, "total deve diminuir ao pagar");
    }

    @SuppressWarnings("unchecked")
    private static double jurosDe(String bloco, String apto, int taxaId) {
        for (Map<String, Object> item : atrasosDoProprietario(bloco, apto)) {
            if (((Number) item.get("id")).intValue() == taxaId) return numero(item, "juros");
        }
        throw new AssertionError("taxa " + taxaId + " não está em atraso");
    }

    private static double totalDevido(String bloco, String apto) {
        return atrasosDoProprietario(bloco, apto).stream().mapToDouble(t -> numero(t, "total")).sum();
    }

    @Test
    @DisplayName("GET /financeiro/taxas filtrado por apartamento devolve só a taxa dele no mês (base do link da tela)")
    void filtroPorApartamento() {
        List<Map<String, Object>> itens = todosOsItensEmAtraso();
        Assumptions.assumeFalse(itens.isEmpty(), "sem mensalidades em atraso no banco");
        Map<String, Object> item = itens.get(0);
        como(admin)
            .queryParam("ano", item.get("ano_referencia")).queryParam("mes", item.get("mes_referencia"))
            .queryParam("apartamento_id", item.get("apartamento_id"))
            .when().get("/financeiro/taxas").then().statusCode(200)
            .body("size()", org.hamcrest.Matchers.equalTo(1))
            .body("[0].id", org.hamcrest.Matchers.equalTo(((Number) item.get("id")).intValue()));

        como(admin).queryParam("ano", 2026).queryParam("mes", 3).queryParam("apartamento_id", 99999999)
            .when().get("/financeiro/taxas").then().statusCode(200).body("size()", org.hamcrest.Matchers.equalTo(0));
    }
}
