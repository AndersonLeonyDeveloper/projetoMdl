package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Acordos e parcelamentos de dívida (`/financeiro/acordos`) — seção 7.21 de sugestoes-de-testes.md e
 * regras-de-negocio.md, seção 4.14. Os testes criam as próprias taxas em atraso (em anos antigos aleatórios), então não
 * mexem nos dados do seed; deixam taxas e acordos no banco. O descumprimento automático (parcela vencida há mais de 5 dias)
 * não tem teste de API, porque exigiria mudar a data do servidor ou do banco.
 */
class AcordosApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;
    private static Map<String, Object> original;
    private static final LocalDate HOJE = LocalDate.now();

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
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

    // ---------- Helpers ----------

    private static int apartamentoLivre() {
        return ThreadLocalRandom.current().nextInt(1, 193);
    }

    /** Cria uma taxa de R$ 300 em atraso (mês de um ano antigo) no apartamento e devolve o id. */
    private static int taxaEmAtraso(int apartamento) {
        for (int tentativa = 0; tentativa < 40; tentativa++) {
            int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
            int mes = ThreadLocalRandom.current().nextInt(1, 13);
            Response r = como(admin).contentType(ContentType.JSON)
                .body(Map.of("apartamento_id", apartamento, "mes_referencia", mes, "ano_referencia", ano, "valor", 300))
                .when().post("/financeiro/taxas");
            if (r.statusCode() == 409) continue;
            return r.then().statusCode(201).extract().path("id");
        }
        throw new AssertionError("sem competência livre");
    }

    private static Map<String, Object> corpo(int apartamento, List<Integer> taxas, int parcelas) {
        Map<String, Object> c = new HashMap<>();
        c.put("apartamento_id", apartamento);
        c.put("taxa_ids", taxas);
        c.put("parcelas", parcelas);
        c.put("primeiro_vencimento", HOJE.plusDays(30).toString());
        return c;
    }

    private static Response simular(Map<String, Object> corpo) {
        return como(admin).contentType(ContentType.JSON).body(corpo).when().post("/financeiro/acordos/simular");
    }

    private static Response criar(Map<String, Object> corpo) {
        return como(admin).contentType(ContentType.JSON).body(corpo).when().post("/financeiro/acordos");
    }

    private static Map<String, Object> detalhe(int id) {
        return como(admin).when().get("/financeiro/acordos/" + id).then().statusCode(200).extract().jsonPath().getMap("$");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> parcelas(int id) {
        return (List<Map<String, Object>>) detalhe(id).get("parcelas");
    }

    private static Response pagar(int acordo, Object parcela, String data) {
        return como(admin).contentType(ContentType.JSON).body(Map.of("data_pagamento", data))
            .when().post("/financeiro/acordos/" + acordo + "/parcelas/" + parcela + "/pagamento");
    }

    private static double numero(Map<String, Object> m, String campo) {
        return ((Number) m.get(campo)).doubleValue();
    }

    private static Map<String, Object> taxa(int apartamento, int id) {
        List<Map<String, Object>> linhas = como(admin).queryParam("apartamento_id", apartamento).when().get("/financeiro/taxas")
            .then().extract().jsonPath().getList("findAll { it.id == " + id + " }");
        return linhas.get(0);
    }

    // ---------- Elegíveis e simulação ----------

    @Test
    @DisplayName("Elegíveis: só taxa em atraso, não paga, não cancelada e fora de outro acordo, com juros até hoje")
    void elegiveis() {
        int apto = apartamentoLivre();
        int emAtraso = taxaEmAtraso(apto);
        int aVencer = como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", apto, "mes_referencia", 1, "ano_referencia", ThreadLocalRandom.current().nextInt(2100, 2900), "valor", 300))
            .when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        int cancelada = taxaEmAtraso(apto);
        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "Teste de acordo")).when().post("/financeiro/taxas/" + cancelada + "/cancelar").then().statusCode(200);

        List<Map<String, Object>> lista = como(admin).queryParam("apartamento_id", apto).when().get("/financeiro/acordos/elegiveis")
            .then().statusCode(200).extract().jsonPath().getList("$");
        org.junit.jupiter.api.Assertions.assertTrue(lista.stream().anyMatch(t -> ((Number) t.get("id")).intValue() == emAtraso));
        org.junit.jupiter.api.Assertions.assertTrue(lista.stream().noneMatch(t -> ((Number) t.get("id")).intValue() == aVencer), "a vencer não entra");
        org.junit.jupiter.api.Assertions.assertTrue(lista.stream().noneMatch(t -> ((Number) t.get("id")).intValue() == cancelada), "cancelada não entra");
        Map<String, Object> t = lista.stream().filter(x -> ((Number) x.get("id")).intValue() == emAtraso).findFirst().get();
        org.junit.jupiter.api.Assertions.assertTrue(numero(t, "juros") > 0 && numero(t, "dias_em_atraso") > 0);
        org.junit.jupiter.api.Assertions.assertEquals(numero(t, "valor") + numero(t, "juros"), numero(t, "total"), 0.006);
    }

    @Test
    @DisplayName("Elegíveis: apartamento inexistente 404, sem parâmetro 400")
    void elegiveisValidacao() {
        como(admin).queryParam("apartamento_id", 99999999).when().get("/financeiro/acordos/elegiveis").then().statusCode(404);
        como(admin).when().get("/financeiro/acordos/elegiveis").then().statusCode(400);
    }

    @Test
    @DisplayName("Simular: valores, parcelas que somam o total exato, vencimentos mensais; não grava nada")
    @SuppressWarnings("unchecked")
    void simulacao() {
        int apto = apartamentoLivre();
        List<Integer> taxas = List.of(taxaEmAtraso(apto), taxaEmAtraso(apto), taxaEmAtraso(apto));
        int antes = como(admin).when().get("/financeiro/acordos").then().extract().jsonPath().getList("$").size();

        Map<String, Object> s = simular(corpo(apto, taxas, 7)).then().statusCode(200).extract().jsonPath().getMap("$");
        org.junit.jupiter.api.Assertions.assertEquals(900.0, numero(s, "valor_taxas"), 0.001);
        org.junit.jupiter.api.Assertions.assertTrue(numero(s, "juros") > 0);
        org.junit.jupiter.api.Assertions.assertEquals(numero(s, "valor_taxas") + numero(s, "juros"), numero(s, "valor_total"), 0.006);
        List<Map<String, Object>> parcelas = (List<Map<String, Object>>) s.get("parcelas");
        org.junit.jupiter.api.Assertions.assertEquals(7, parcelas.size());
        double soma = parcelas.stream().mapToDouble(p -> numero(p, "valor")).sum();
        org.junit.jupiter.api.Assertions.assertEquals(numero(s, "valor_total"), soma, 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(HOJE.plusDays(30).toString(), parcelas.get(0).get("vencimento"));
        org.junit.jupiter.api.Assertions.assertEquals(HOJE.plusDays(30).plusMonths(1).toString(), parcelas.get(1).get("vencimento"));

        Map<String, Object> comEntrada = new HashMap<>(corpo(apto, taxas, 4));
        comEntrada.put("entrada", 200);
        comEntrada.put("desconto", 100);
        Map<String, Object> s2 = simular(comEntrada).then().statusCode(200).extract().jsonPath().getMap("$");
        List<Map<String, Object>> p2 = (List<Map<String, Object>>) s2.get("parcelas");
        org.junit.jupiter.api.Assertions.assertEquals(0, ((Number) p2.get(0).get("numero")).intValue(), "entrada é a parcela 0");
        org.junit.jupiter.api.Assertions.assertEquals(200.0, numero(p2.get(0), "valor"), 0.001);
        org.junit.jupiter.api.Assertions.assertEquals(HOJE.toString(), p2.get(0).get("vencimento"));
        org.junit.jupiter.api.Assertions.assertEquals(numero(s2, "valor_taxas") + numero(s2, "juros") - 100, numero(s2, "valor_total"), 0.006);
        org.junit.jupiter.api.Assertions.assertEquals(numero(s2, "valor_total"), p2.stream().mapToDouble(p -> numero(p, "valor")).sum(), 0.001);

        int depois = como(admin).when().get("/financeiro/acordos").then().extract().jsonPath().getList("$").size();
        org.junit.jupiter.api.Assertions.assertEquals(antes, depois, "simular não grava");
    }

    @Test
    @DisplayName("Validações: sem taxas, parcelas fora de 1–60, vencimento no passado, desconto ou entrada ≥ total, taxa de outro apartamento, observação longa")
    void validacoes() {
        int apto = apartamentoLivre();
        int taxa = taxaEmAtraso(apto);
        List<Integer> taxas = List.of(taxa);
        double total = numero(simular(corpo(apto, taxas, 1)).then().statusCode(200).extract().jsonPath().getMap("$"), "valor_total");

        simular(corpo(apto, List.of(), 3)).then().statusCode(400);
        for (int parcelas : List.of(0, 61, -1)) simular(corpo(apto, taxas, parcelas)).then().statusCode(400);
        simular(corpo(apto, taxas, 1)).then().statusCode(200);
        simular(corpo(apto, taxas, 60)).then().statusCode(200);

        Map<String, Object> passado = new HashMap<>(corpo(apto, taxas, 3));
        passado.put("primeiro_vencimento", HOJE.minusDays(1).toString());
        simular(passado).then().statusCode(400);
        passado.put("primeiro_vencimento", "ontem");
        simular(passado).then().statusCode(400);
        passado.put("primeiro_vencimento", HOJE.toString());
        simular(passado).then().statusCode(200);

        for (double desconto : List.of(-1.0, total, total + 1)) {
            Map<String, Object> c = new HashMap<>(corpo(apto, taxas, 3));
            c.put("desconto", desconto);
            simular(c).then().statusCode(400);
        }
        for (double entrada : List.of(-5.0, total)) {
            Map<String, Object> c = new HashMap<>(corpo(apto, taxas, 3));
            c.put("entrada", entrada);
            simular(c).then().statusCode(400);
        }
        Map<String, Object> longa = new HashMap<>(corpo(apto, taxas, 3));
        longa.put("observacao", "x".repeat(301));
        simular(longa).then().statusCode(400);

        int outroApto = apto == 1 ? 2 : 1;
        simular(corpo(outroApto, taxas, 3)).then().statusCode(409);
        simular(corpo(apto, List.of(99999999), 3)).then().statusCode(409);
        simular(corpo(99999999, taxas, 3)).then().statusCode(404);
    }

    // ---------- Criar e efeitos ----------

    @Test
    @DisplayName("Criar: detalhe, lista e filtros; as mesmas taxas não entram em outro acordo")
    @SuppressWarnings("unchecked")
    void criar() {
        int apto = apartamentoLivre();
        List<Integer> taxas = List.of(taxaEmAtraso(apto), taxaEmAtraso(apto));
        Map<String, Object> c = new HashMap<>(corpo(apto, taxas, 3));
        c.put("entrada", 100);
        c.put("observacao", "Acordo de teste");
        int id = criar(c).then().statusCode(201).extract().path("id");

        Map<String, Object> d = detalhe(id);
        org.junit.jupiter.api.Assertions.assertEquals("ativo", d.get("status"));
        org.junit.jupiter.api.Assertions.assertEquals("Acordo de teste", d.get("observacao"));
        org.junit.jupiter.api.Assertions.assertEquals(2, ((List<?>) d.get("taxas")).size());
        org.junit.jupiter.api.Assertions.assertEquals(4, ((List<?>) d.get("parcelas")).size(), "entrada + 3 parcelas");

        como(admin).queryParam("status", "ativo").when().get("/financeiro/acordos").then().statusCode(200)
            .body("findAll { it.id == " + id + " }.size()", equalTo(1));
        como(admin).queryParam("apartamento_id", apto).when().get("/financeiro/acordos").then().statusCode(200)
            .body("findAll { it.id == " + id + " }.size()", equalTo(1));
        como(admin).queryParam("status", "quitado").when().get("/financeiro/acordos").then().statusCode(200)
            .body("findAll { it.id == " + id + " }.size()", equalTo(0));

        criar(corpo(apto, taxas, 3)).then().statusCode(409);
        como(admin).queryParam("apartamento_id", apto).when().get("/financeiro/acordos/elegiveis").then().statusCode(200).body("size()", equalTo(0));
    }

    @Test
    @DisplayName("Taxa em acordo: status \"em_acordo\", fora do atraso, e não aceita pagar, editar nem cancelar diretamente")
    void taxaEmAcordo() {
        int apto = apartamentoLivre();
        int taxaId = taxaEmAtraso(apto);
        int id = criar(corpo(apto, List.of(taxaId), 2)).then().statusCode(201).extract().path("id");

        Map<String, Object> t = taxa(apto, taxaId);
        org.junit.jupiter.api.Assertions.assertEquals("em_acordo", t.get("status"));
        org.junit.jupiter.api.Assertions.assertEquals(id, ((Number) t.get("acordo_id")).intValue());
        org.junit.jupiter.api.Assertions.assertEquals("inadimplente", t.get("situacao"));

        como(admin).multiPart("data_pagamento", HOJE.toString()).when().put("/financeiro/taxas/" + taxaId + "/pagamento").then().statusCode(409);
        como(admin).contentType(ContentType.JSON).body(Map.of("valor", 1)).when().put("/financeiro/taxas/" + taxaId).then().statusCode(409);
        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "Tentando cancelar")).when().post("/financeiro/taxas/" + taxaId + "/cancelar").then().statusCode(409);

        // Dados dos Moradores: sai do atraso e entra na contagem "em acordo"
        List<Map<String, Object>> linhas = como(admin).when().get("/dados-moradores").then().extract().jsonPath().getList("$");
        Map<String, Object> linha = linhas.stream().filter(l -> ((Number) l.get("apartamento_id")).intValue() == apto && l.get("taxas_em_atraso") != null).findFirst().get();
        org.junit.jupiter.api.Assertions.assertTrue(((Number) linha.get("taxas_em_acordo")).intValue() >= 1);
        org.junit.jupiter.api.Assertions.assertTrue(((List<Map<String, Object>>) linha.get("taxas_em_atraso")).stream().noneMatch(x -> ((Number) x.get("id")).intValue() == taxaId));
    }

    // ---------- Pagamentos e quitação ----------

    @Test
    @DisplayName("Pagar parcelas: vira receita do mês do pagamento; a última quita o acordo e a taxa vira \"quitada_acordo\"")
    void pagarEQuitar() {
        int apto = apartamentoLivre();
        int taxaId = taxaEmAtraso(apto);
        Map<String, Object> c = new HashMap<>(corpo(apto, List.of(taxaId), 2));
        c.put("entrada", 50);
        int id = criar(c).then().statusCode(201).extract().path("id");
        List<Map<String, Object>> ps = parcelas(id);

        double antes = como(admin).queryParam("ano", HOJE.getYear()).queryParam("mes", HOJE.getMonthValue()).when().get("/financeiro/resumo/mensal")
            .then().extract().jsonPath().getDouble("receitas_acordos");
        pagar(id, ps.get(0).get("id"), HOJE.toString()).then().statusCode(200).body("status", equalTo("ativo")).body("parcelas_restantes", equalTo(2));
        double depois = como(admin).queryParam("ano", HOJE.getYear()).queryParam("mes", HOJE.getMonthValue()).when().get("/financeiro/resumo/mensal")
            .then().extract().jsonPath().getDouble("receitas_acordos");
        org.junit.jupiter.api.Assertions.assertEquals(50.0, depois - antes, 0.011, "a entrada vira receita do mês do pagamento");

        pagar(id, ps.get(0).get("id"), HOJE.toString()).then().statusCode(409);
        pagar(id, ps.get(1).get("id"), "x").then().statusCode(400);
        pagar(id, 99999999, HOJE.toString()).then().statusCode(404);
        como(proprietario).contentType(ContentType.JSON).body(Map.of("data_pagamento", HOJE.toString()))
            .when().post("/financeiro/acordos/" + id + "/parcelas/" + ps.get(1).get("id") + "/pagamento").then().statusCode(403);

        pagar(id, ps.get(1).get("id"), HOJE.toString()).then().statusCode(200).body("status", equalTo("ativo"));
        pagar(id, ps.get(2).get("id"), HOJE.toString()).then().statusCode(200).body("status", equalTo("quitado"));

        Map<String, Object> d = detalhe(id);
        org.junit.jupiter.api.Assertions.assertEquals("quitado", d.get("status"));
        org.junit.jupiter.api.Assertions.assertNotNull(d.get("encerrado_em"));
        org.junit.jupiter.api.Assertions.assertEquals(numero(d, "valor_total"), numero(d, "valor_pago"), 0.006);
        org.junit.jupiter.api.Assertions.assertEquals("quitada_acordo", taxa(apto, taxaId).get("status"));

        pagar(id, ps.get(2).get("id"), HOJE.toString()).then().statusCode(409);
        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "Tentando cancelar quitado"))
            .when().post("/financeiro/acordos/" + id + "/cancelar").then().statusCode(409);
    }

    @Test
    @DisplayName("Cancelar: motivo obrigatório; as taxas voltam ao atraso e a parcela já paga continua como receita")
    void cancelar() {
        int apto = apartamentoLivre();
        int taxaId = taxaEmAtraso(apto);
        int id = criar(corpo(apto, List.of(taxaId), 3)).then().statusCode(201).extract().path("id");
        List<Map<String, Object>> ps = parcelas(id);
        pagar(id, ps.get(0).get("id"), HOJE.toString()).then().statusCode(200);

        como(admin).contentType(ContentType.JSON).body("{}").when().post("/financeiro/acordos/" + id + "/cancelar").then().statusCode(400);
        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "ab")).when().post("/financeiro/acordos/" + id + "/cancelar").then().statusCode(400);
        como(proprietario).contentType(ContentType.JSON).body(Map.of("motivo", "Teste")).when().post("/financeiro/acordos/" + id + "/cancelar").then().statusCode(403);
        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "Morador desistiu do acordo")).when().post("/financeiro/acordos/" + id + "/cancelar").then().statusCode(200);

        Map<String, Object> d = detalhe(id);
        org.junit.jupiter.api.Assertions.assertEquals("cancelado", d.get("status"));
        org.junit.jupiter.api.Assertions.assertEquals("Morador desistiu do acordo", d.get("motivo_cancelamento"));
        org.junit.jupiter.api.Assertions.assertEquals(numero(ps.get(0), "valor"), numero(d, "valor_pago"), 0.006);
        Map<String, Object> t = taxa(apto, taxaId);
        org.junit.jupiter.api.Assertions.assertEquals("em_atraso", t.get("status"));
        org.junit.jupiter.api.Assertions.assertNull(t.get("acordo_id"));
        como(admin).queryParam("apartamento_id", apto).when().get("/financeiro/acordos/elegiveis").then().statusCode(200)
            .body("findAll { it.id == " + taxaId + " }.size()", equalTo(1));

        pagar(id, ps.get(1).get("id"), HOJE.toString()).then().statusCode(409).body("error", containsString("cancelado"));
        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "Outra vez")).when().post("/financeiro/acordos/" + id + "/cancelar").then().statusCode(409);
    }

    // ---------- Resumos, acesso e histórico ----------

    @Test
    @DisplayName("Resumos: a taxa em acordo sai do inadimplente do bloco e da inadimplência anual e vai para \"em_acordo\"")
    @SuppressWarnings("unchecked")
    void resumos() {
        int apto = apartamentoLivre();
        int taxaId = taxaEmAtraso(apto);
        Map<String, Object> t = taxa(apto, taxaId);
        int ano = ((Number) t.get("ano_referencia")).intValue();
        int mes = ((Number) t.get("mes_referencia")).intValue();
        double gravado = numero(t, "valor") + numero(t, "juros");
        java.util.function.Supplier<Double> inadimplenteAnual = () -> como(admin).queryParam("ano", ano).when().get("/financeiro/resumo/inadimplencia")
            .then().extract().jsonPath().getDouble("find { it.mes_referencia == " + mes + " }.inadimplente");
        java.util.function.Supplier<Double> emAcordoAnual = () -> como(admin).queryParam("ano", ano).when().get("/financeiro/resumo/inadimplencia")
            .then().extract().jsonPath().getDouble("find { it.mes_referencia == " + mes + " }.em_acordo");
        double antes = inadimplenteAnual.get();
        double acordoAntes = emAcordoAnual.get();

        criar(corpo(apto, List.of(taxaId), 2)).then().statusCode(201);
        org.junit.jupiter.api.Assertions.assertEquals(antes - gravado, inadimplenteAnual.get(), 0.011);
        org.junit.jupiter.api.Assertions.assertEquals(acordoAntes + gravado, emAcordoAnual.get(), 0.011);
    }

    @Test
    @DisplayName("Acordos são só do admin: morador 403 em tudo, sem token 401, inexistente 404")
    void acesso() {
        int apto = apartamentoLivre();
        int taxaId = taxaEmAtraso(apto);
        Map<String, Object> c = corpo(apto, List.of(taxaId), 2);
        como(proprietario).when().get("/financeiro/acordos").then().statusCode(403);
        como(proprietario).contentType(ContentType.JSON).body(c).when().post("/financeiro/acordos/simular").then().statusCode(403);
        como(proprietario).contentType(ContentType.JSON).body(c).when().post("/financeiro/acordos").then().statusCode(403);
        como(proprietario).queryParam("apartamento_id", apto).when().get("/financeiro/acordos/elegiveis").then().statusCode(403);
        semLogin().when().get("/financeiro/acordos").then().statusCode(401);
        como(admin).when().get("/financeiro/acordos/99999999").then().statusCode(404);
    }

    @Test
    @DisplayName("Criar, pagar parcela, quitar e cancelar ficam no histórico de alterações")
    void historico() {
        int apto = apartamentoLivre();
        int id = criar(corpo(apto, List.of(taxaEmAtraso(apto)), 1)).then().statusCode(201).extract().path("id");
        pagar(id, parcelas(id).get(0).get("id"), HOJE.toString()).then().statusCode(200).body("status", equalTo("quitado"));
        List<String> acoes = como(admin).queryParam("entidade", "acordo").queryParam("entidade_id", id).when().get("/financeiro/auditoria")
            .then().statusCode(200).extract().jsonPath().getList("itens.acao");
        org.junit.jupiter.api.Assertions.assertEquals(List.of("quitar", "pagar_parcela", "criar"), new ArrayList<>(acoes));

        int apto2 = apartamentoLivre();
        int id2 = criar(corpo(apto2, List.of(taxaEmAtraso(apto2)), 2)).then().statusCode(201).extract().path("id");
        como(admin).contentType(ContentType.JSON).body(Map.of("motivo", "Cancelado para o teste")).when().post("/financeiro/acordos/" + id2 + "/cancelar").then().statusCode(200);
        como(admin).queryParam("entidade", "acordo").queryParam("entidade_id", id2).queryParam("acao", "cancelar").when().get("/financeiro/auditoria")
            .then().statusCode(200).body("total", equalTo(1)).body("itens[0].depois.status", equalTo("cancelado"));
    }
}
