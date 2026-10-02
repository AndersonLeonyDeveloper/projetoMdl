package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.containsString;

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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Cancelar e restaurar lançamentos (exclusão lógica) — seção 7.15 de sugestoes-de-testes.md e
 * regras-de-negocio.md, seção 4.11. O registro continua no banco; só sai das listas e dos totais.
 */
class CancelamentoApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;
    private static Map<String, Object> original;

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

    private static Response cancelar(String token, String rota, int id, String motivo) {
        var req = como(token).contentType(ContentType.JSON);
        req = motivo == null ? req.body("{}") : req.body(Map.of("motivo", motivo));
        return req.when().post("/financeiro/" + rota + "/" + id + "/cancelar");
    }

    private static Response restaurar(String token, String rota, int id) {
        return como(token).contentType(ContentType.JSON).body("{}").when().post("/financeiro/" + rota + "/" + id + "/restaurar");
    }

    private static int criar(String rota) {
        return como(admin).contentType(ContentType.JSON)
            .body(Map.of("descricao", "Cancelável " + UUID.randomUUID(), "valor", 200, "data", "2026-09-15"))
            .when().post("/financeiro/" + rota).then().statusCode(201).extract().path("id");
    }

    private static List<Map<String, Object>> doMes(String token, String rota, int id, boolean incluirCancelados) {
        var req = como(token).queryParam("ano", 2026).queryParam("mes", 9);
        if (incluirCancelados) req = req.queryParam("incluir_cancelados", "true");
        return req.when().get("/financeiro/" + rota).then().statusCode(200).extract().jsonPath()
            .getList("findAll { it.id == " + id + " }");
    }

    private static double resumo(String campo) {
        return como(admin).queryParam("ano", 2026).queryParam("mes", 9).when().get("/financeiro/resumo/mensal")
            .then().statusCode(200).extract().jsonPath().getDouble(campo);
    }

    // ---------- Despesas e outras receitas ----------

    @ParameterizedTest(name = "{0}: cancelar tira da lista e do resumo; restaurar devolve")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Ciclo cancelar e restaurar")
    void cicloCompleto(String rota) {
        String campo = "despesas".equals(rota) ? "despesas" : "receitas";
        int id = criar(rota);
        double antes = resumo(campo);

        cancelar(admin, rota, id, "Lançado em duplicidade").then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertTrue(doMes(admin, rota, id, false).isEmpty(), "some da lista padrão");
        List<Map<String, Object>> comCancelados = doMes(admin, rota, id, true);
        org.junit.jupiter.api.Assertions.assertEquals(1, comCancelados.size());
        org.junit.jupiter.api.Assertions.assertEquals("Lançado em duplicidade", comCancelados.get(0).get("motivo_cancelamento"));
        org.junit.jupiter.api.Assertions.assertNotNull(comCancelados.get(0).get("cancelado_em"));
        org.junit.jupiter.api.Assertions.assertEquals(antes - 200, resumo(campo), 0.001, "sai do resumo mensal");

        restaurar(admin, rota, id).then().statusCode(200);
        List<Map<String, Object>> restaurada = doMes(admin, rota, id, false);
        org.junit.jupiter.api.Assertions.assertEquals(1, restaurada.size());
        org.junit.jupiter.api.Assertions.assertNull(restaurada.get(0).get("cancelado_em"));
        org.junit.jupiter.api.Assertions.assertEquals(antes, resumo(campo), 0.001, "volta ao resumo mensal");
    }

    @ParameterizedTest(name = "{0}: motivo obrigatório (3 a 200 caracteres)")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Validação do motivo")
    void motivoObrigatorio(String rota) {
        int id = criar(rota);
        cancelar(admin, rota, id, null).then().statusCode(400);
        cancelar(admin, rota, id, "ab").then().statusCode(400);
        cancelar(admin, rota, id, "   ").then().statusCode(400);
        cancelar(admin, rota, id, "x".repeat(201)).then().statusCode(400);
        cancelar(admin, rota, id, "x".repeat(200)).then().statusCode(200);
    }

    @ParameterizedTest(name = "{0}: editar, cancelar de novo e restaurar quem não está cancelado")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Estados inválidos retornam 409")
    void estadosInvalidos(String rota) {
        int id = criar(rota);
        restaurar(admin, rota, id).then().statusCode(409);
        cancelar(admin, rota, id, "Motivo válido").then().statusCode(200);
        cancelar(admin, rota, id, "Outra vez").then().statusCode(409);
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", 1, "data", "2026-09-15"))
            .when().put("/financeiro/" + rota + "/" + id).then().statusCode(409).body("error", containsString("cancelada"));
    }

    @ParameterizedTest(name = "{0}: só o admin cancela e vê cancelados")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Acesso")
    void acesso(String rota) {
        int id = criar(rota);
        cancelar(proprietario, rota, id, "teste").then().statusCode(403);
        restaurar(proprietario, rota, id).then().statusCode(403);
        semLogin().contentType(ContentType.JSON).body("{}").when().post("/financeiro/" + rota + "/" + id + "/cancelar").then().statusCode(401);
        cancelar(admin, rota, id, "Para testar a visibilidade").then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertTrue(doMes(proprietario, rota, id, true).isEmpty(), "morador não vê cancelados, nem pedindo");
        cancelar(admin, rota, 99999999, "teste").then().statusCode(404);
        restaurar(admin, rota, 99999999).then().statusCode(404);
    }

    // ---------- Taxas ----------

    private static int[] novaTaxa(int mes) {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        int apto = ThreadLocalRandom.current().nextInt(1, 193);
        int id = como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", apto, "mes_referencia", mes, "ano_referencia", ano, "valor", 300))
            .when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        return new int[] {id, ano, apto};
    }

    private static List<Map<String, Object>> taxas(int[] t, int mes, boolean incluirCancelados) {
        var req = como(admin).queryParam("ano", t[1]).queryParam("mes", mes).queryParam("apartamento_id", t[2]);
        if (incluirCancelados) req = req.queryParam("incluir_cancelados", "true");
        return req.when().get("/financeiro/taxas").then().statusCode(200).extract().jsonPath().getList("$");
    }

    private static double inadimplenteDoBloco(int ano, int mes) {
        return como(admin).queryParam("ano", ano).queryParam("mes", mes).when().get("/financeiro/resumo/blocos")
            .then().statusCode(200).extract().jsonPath().getDouble("sum { it.inadimplente }");
    }

    @Test
    @DisplayName("Taxa cancelada some da lista, do resumo por bloco e de Dados dos Moradores; aparece como \"cancelada\" com o filtro")
    void taxaCancelada() {
        int[] t = novaTaxa(2);
        double antes = inadimplenteDoBloco(t[1], 2);
        cancelar(admin, "taxas", t[0], "Gerada para o apartamento errado").then().statusCode(200);

        org.junit.jupiter.api.Assertions.assertTrue(taxas(t, 2, false).isEmpty());
        List<Map<String, Object>> incl = taxas(t, 2, true);
        org.junit.jupiter.api.Assertions.assertEquals(1, incl.size());
        org.junit.jupiter.api.Assertions.assertEquals("cancelada", incl.get(0).get("status"));
        org.junit.jupiter.api.Assertions.assertEquals(antes - 300, inadimplenteDoBloco(t[1], 2), 0.001);

        restaurar(admin, "taxas", t[0]).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(1, taxas(t, 2, false).size());
        org.junit.jupiter.api.Assertions.assertEquals(antes, inadimplenteDoBloco(t[1], 2), 0.001);
    }

    @Test
    @DisplayName("Taxa cancelada não aceita pagamento, edição nem recálculo de juros (409)")
    void taxaCanceladaNaoMuda() {
        int[] t = novaTaxa(3);
        cancelar(admin, "taxas", t[0], "Cancelada para o teste").then().statusCode(200);
        como(admin).multiPart("data_pagamento", t[1] + "-03-20").when().put("/financeiro/taxas/" + t[0] + "/pagamento").then().statusCode(409);
        como(admin).contentType(ContentType.JSON).body(Map.of("valor", 1)).when().put("/financeiro/taxas/" + t[0]).then().statusCode(409);
        como(admin).when().post("/financeiro/taxas/" + t[0] + "/recalcular-juros").then().statusCode(409);
    }

    @Test
    @DisplayName("Taxa paga não pode ser cancelada; depois de remover o pagamento, pode")
    void taxaPagaNaoCancela() {
        int[] t = novaTaxa(4);
        como(admin).multiPart("data_pagamento", t[1] + "-04-20").when().put("/financeiro/taxas/" + t[0] + "/pagamento").then().statusCode(200);
        cancelar(admin, "taxas", t[0], "Tentando cancelar paga").then().statusCode(409).body("error", containsString("pagamento"));
        como(admin).contentType(ContentType.JSON).body(Map.of("data_pagamento", "")).when().put("/financeiro/taxas/" + t[0]).then().statusCode(200);
        cancelar(admin, "taxas", t[0], "Agora pode").then().statusCode(200);
    }

    @Test
    @DisplayName("Lançar de novo a taxa de um mês cancelado retorna 409 e orienta a restaurar; gerar o mês a trata como existente")
    void taxaCanceladaContaComoExistente() {
        int[] t = novaTaxa(5);
        cancelar(admin, "taxas", t[0], "Cancelada para o teste").then().statusCode(200);
        como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", t[2], "mes_referencia", 5, "ano_referencia", t[1], "valor", 300))
            .when().post("/financeiro/taxas").then().statusCode(409).body("error", containsString("cancelada"));
        como(admin).queryParam("mes_referencia", 5).queryParam("ano_referencia", t[1]).when().get("/financeiro/taxas/gerar-mes/previa")
            .then().statusCode(200).body("existentes", org.hamcrest.Matchers.greaterThanOrEqualTo(1));
    }

    @Test
    @DisplayName("Taxa: morador 403, sem token 401, inexistente 404")
    void taxaAcesso() {
        int[] t = novaTaxa(6);
        cancelar(proprietario, "taxas", t[0], "teste").then().statusCode(403);
        restaurar(proprietario, "taxas", t[0]).then().statusCode(403);
        semLogin().contentType(ContentType.JSON).body("{}").when().post("/financeiro/taxas/" + t[0] + "/cancelar").then().statusCode(401);
        cancelar(admin, "taxas", 99999999, "teste").then().statusCode(404);
    }

    @Test
    @DisplayName("Cancelar e restaurar ficam no histórico, com o motivo")
    void historico() {
        int id = criar("despesas");
        cancelar(admin, "despesas", id, "Duplicidade confirmada").then().statusCode(200);
        restaurar(admin, "despesas", id).then().statusCode(200);
        List<String> acoes = como(admin).queryParam("entidade", "despesa").queryParam("entidade_id", id)
            .when().get("/financeiro/auditoria").then().statusCode(200).extract().jsonPath().getList("itens.acao");
        org.junit.jupiter.api.Assertions.assertEquals(List.of("restaurar", "cancelar", "criar"), acoes);
        como(admin).queryParam("entidade", "despesa").queryParam("entidade_id", id).queryParam("acao", "cancelar")
            .when().get("/financeiro/auditoria").then().statusCode(200)
            .body("itens[0].depois.motivo_cancelamento", org.hamcrest.Matchers.equalTo("Duplicidade confirmada"));
    }
}
