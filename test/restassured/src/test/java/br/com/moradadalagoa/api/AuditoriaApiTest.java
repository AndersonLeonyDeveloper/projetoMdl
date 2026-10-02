package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Histórico de alterações (`GET /financeiro/auditoria`) — seção 7.14 de sugestoes-de-testes.md e
 * regras-de-negocio.md, seção 4.10. O histórico só cresce: os testes comparam contagens antes e depois.
 */
class AuditoriaApiTest extends ApiBase {

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

    private static Response auditoria(Map<String, Object> filtros) {
        var req = como(admin);
        for (var e : filtros.entrySet()) req = req.queryParam(e.getKey(), e.getValue());
        return req.when().get("/financeiro/auditoria");
    }

    private static List<Map<String, Object>> itens(Map<String, Object> filtros) {
        return auditoria(filtros).then().statusCode(200).extract().jsonPath().getList("itens");
    }

    private static int total(Map<String, Object> filtros) {
        return auditoria(filtros).then().statusCode(200).extract().path("total");
    }

    private static int criarDespesa(String descricao) {
        return como(admin).contentType(ContentType.JSON)
            .body(Map.of("descricao", descricao, "valor", 100, "data", "2026-09-15"))
            .when().post("/financeiro/despesas").then().statusCode(201).extract().path("id");
    }

    private static int[] novaTaxa() {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1999);
        int id = como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", ThreadLocalRandom.current().nextInt(1, 193),
                "mes_referencia", 3, "ano_referencia", ano, "valor", 300))
            .when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        return new int[] {id, ano};
    }

    @Test
    @DisplayName("Criar e editar uma despesa grava o antes, o depois, quem e o resumo")
    void despesaCriarEEditar() {
        String descricao = "Auditoria " + UUID.randomUUID();
        int id = criarDespesa(descricao);
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", descricao + " B", "valor", 150, "data", "2026-09-15"))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);

        List<Map<String, Object>> registros = itens(Map.of("entidade", "despesa", "entidade_id", id));
        org.junit.jupiter.api.Assertions.assertEquals(2, registros.size());
        Map<String, Object> editar = registros.get(0); // mais recente primeiro
        Map<String, Object> criar = registros.get(1);
        org.junit.jupiter.api.Assertions.assertEquals("editar", editar.get("acao"));
        org.junit.jupiter.api.Assertions.assertEquals("criar", criar.get("acao"));
        org.junit.jupiter.api.Assertions.assertEquals(ADMIN, editar.get("usuario_email"));
        org.junit.jupiter.api.Assertions.assertNull(criar.get("antes"));
        @SuppressWarnings("unchecked") Map<String, Object> antes = (Map<String, Object>) editar.get("antes");
        @SuppressWarnings("unchecked") Map<String, Object> depois = (Map<String, Object>) editar.get("depois");
        org.junit.jupiter.api.Assertions.assertEquals(100.0, ((Number) antes.get("valor")).doubleValue());
        org.junit.jupiter.api.Assertions.assertEquals(150.0, ((Number) depois.get("valor")).doubleValue());
        org.junit.jupiter.api.Assertions.assertEquals(descricao, antes.get("descricao"));
    }

    @Test
    @DisplayName("Editar sem mudar nada não grava no histórico")
    void edicaoSemMudancaNaoGrava() {
        String descricao = "Auditoria " + UUID.randomUUID();
        int id = criarDespesa(descricao);
        int antes = total(Map.of("entidade", "despesa", "entidade_id", id));
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", descricao, "valor", 100, "data", "2026-09-15"))
            .when().put("/financeiro/despesas/" + id).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(antes, total(Map.of("entidade", "despesa", "entidade_id", id)));
    }

    @Test
    @DisplayName("Taxa: criar, pagar, editar e recalcular juros geram uma linha cada, com resumo \"Bl./Ap. · mês/ano\"")
    void ciclosDaTaxa() {
        int[] t = novaTaxa();
        como(admin).multiPart("data_pagamento", t[1] + "-03-20").when().put("/financeiro/taxas/" + t[0] + "/pagamento").then().statusCode(200);
        como(admin).contentType(ContentType.JSON).body(Map.of("valor", 350)).when().put("/financeiro/taxas/" + t[0]).then().statusCode(200);
        como(admin).when().post("/financeiro/taxas/" + t[0] + "/recalcular-juros").then().statusCode(200);

        List<Map<String, Object>> registros = itens(Map.of("entidade", "taxa", "entidade_id", t[0]));
        org.junit.jupiter.api.Assertions.assertEquals(List.of("recalcular_juros", "editar", "pagar", "criar"),
            registros.stream().map(r -> r.get("acao")).toList());
        org.junit.jupiter.api.Assertions.assertTrue(((String) registros.get(0).get("detalhe")).matches("Bl\\..+/Ap\\..+ · 03/" + t[1]));
    }

    @Test
    @DisplayName("Gerar o mês grava uma linha com as contagens; gerar de novo (0 criadas) não grava")
    void gerarMes() {
        int ano = ThreadLocalRandom.current().nextInt(2100, 2900);
        definirTaxaDoAno(admin, ano, 340);
        int antes = total(Map.of("acao", "gerar_mes"));
        como(admin).contentType(ContentType.JSON).body(Map.of("mes_referencia", 1, "ano_referencia", ano))
            .when().post("/financeiro/taxas/gerar-mes").then().statusCode(201);
        org.junit.jupiter.api.Assertions.assertEquals(antes + 1, total(Map.of("acao", "gerar_mes")));
        como(admin).contentType(ContentType.JSON).body(Map.of("mes_referencia", 1, "ano_referencia", ano))
            .when().post("/financeiro/taxas/gerar-mes").then().statusCode(201);
        org.junit.jupiter.api.Assertions.assertEquals(antes + 1, total(Map.of("acao", "gerar_mes")));
    }

    @Test
    @DisplayName("Alterar a configuração grava; salvar o mesmo valor não grava")
    void configuracao() {
        int antes = total(Map.of("entidade", "configuracao"));
        salvarConfiguracao(admin, 1, 2, 10);
        org.junit.jupiter.api.Assertions.assertEquals(antes + 1, total(Map.of("entidade", "configuracao")));
        salvarConfiguracao(admin, 1, 2, 10);
        org.junit.jupiter.api.Assertions.assertEquals(antes + 1, total(Map.of("entidade", "configuracao")));
        salvarConfiguracao(admin, 2, 1, 10);
        org.junit.jupiter.api.Assertions.assertEquals(antes + 2, total(Map.of("entidade", "configuracao")));
    }

    @Test
    @DisplayName("Filtros por ação, usuário e período; data inválida retorna 400")
    void filtros() {
        criarDespesa("Auditoria " + UUID.randomUUID());
        String hoje = LocalDate.now().toString();
        org.junit.jupiter.api.Assertions.assertTrue(total(Map.of("acao", "criar")) > 0);
        org.junit.jupiter.api.Assertions.assertTrue(total(Map.of("usuario", "admin@")) > 0);
        org.junit.jupiter.api.Assertions.assertEquals(0, total(Map.of("usuario", "ninguem-" + UUID.randomUUID())));
        org.junit.jupiter.api.Assertions.assertTrue(total(Map.of("de", hoje, "ate", hoje)) > 0);
        org.junit.jupiter.api.Assertions.assertEquals(0, total(Map.of("de", "2000-01-01", "ate", "2000-12-31")));
        auditoria(Map.of("de", "ontem")).then().statusCode(400);
    }

    @Test
    @DisplayName("Paginação em ordem decrescente e limite máximo de 200")
    void paginacao() {
        for (int i = 0; i < 3; i++) criarDespesa("Auditoria " + UUID.randomUUID());
        auditoria(Map.of("limite", 2, "pagina", 1)).then().statusCode(200).body("itens", hasSize(2)).body("limite", equalTo(2));
        List<Map<String, Object>> p1 = itens(Map.of("limite", 2, "pagina", 1));
        List<Map<String, Object>> p2 = itens(Map.of("limite", 2, "pagina", 2));
        org.junit.jupiter.api.Assertions.assertTrue(((Number) p1.get(1).get("id")).intValue() > ((Number) p2.get(0).get("id")).intValue());
        auditoria(Map.of("limite", 9999)).then().statusCode(200).body("limite", lessThanOrEqualTo(200));
    }

    @Test
    @DisplayName("Só o admin consulta; o histórico não tem rota para editar nem apagar")
    void acessoEImutabilidade() {
        como(proprietario).when().get("/financeiro/auditoria").then().statusCode(403);
        semLogin().when().get("/financeiro/auditoria").then().statusCode(401);
        como(admin).when().delete("/financeiro/auditoria/1").then().statusCode(404);
        como(admin).contentType(ContentType.JSON).body("{}").when().put("/financeiro/auditoria/1").then().statusCode(404);
    }
}
