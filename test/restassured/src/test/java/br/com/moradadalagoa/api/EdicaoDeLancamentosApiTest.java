package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Edição de despesas, outras receitas e taxas — seção 7.5 de sugestoes-de-testes.md (regras na seção 4.8). */
class EdicaoDeLancamentosApiTest extends ApiBase {

    private static final byte[] PDF = "%PDF-1.4\n% comprovante de teste\n".getBytes(StandardCharsets.ISO_8859_1);
    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F'};

    private static String admin;
    private static String proprietario;
    private static String inquilino;

    @BeforeAll
    static void logins() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
        inquilino = login(INQUILINO);
        salvarConfiguracao(admin, 2, 1, 10); // os testes de taxa assumem os padrões
    }

    // ---------- Helpers ----------

    private static String descricaoUnica() {
        return "Teste edição " + UUID.randomUUID();
    }

    private static int criar(String recurso, String descricao, byte[] arquivo) {
        var req = como(admin).multiPart("descricao", descricao).multiPart("valor", "100.00").multiPart("data", "2026-09-15");
        if (arquivo != null) req = req.multiPart("comprovante", "r.pdf", arquivo, "application/pdf");
        return req.when().post("/financeiro/" + recurso).then().statusCode(201).extract().path("id");
    }

    private static Map<String, Object> ler(String recurso, int id) {
        List<Map<String, Object>> linhas = como(admin).queryParam("ano", 2026).queryParam("mes", 9)
            .when().get("/financeiro/" + recurso).then().statusCode(200)
            .extract().jsonPath().getList("findAll { it.id == " + id + " }");
        org.junit.jupiter.api.Assertions.assertEquals(1, linhas.size());
        return linhas.get(0);
    }

    private static Response editarJson(String token, String recurso, int id, Map<String, ?> corpo) {
        return como(token).contentType(ContentType.JSON).body(corpo).when().put("/financeiro/" + recurso + "/" + id);
    }

    private static Map<String, String> corpoValido(String descricao) {
        return Map.of("descricao", descricao, "valor", "250.50", "data", "2026-09-20");
    }

    private static Response editarMultipart(String recurso, int id, byte[] arquivo, String mime, boolean remover) {
        var req = como(admin).multiPart("descricao", "Editada").multiPart("valor", "250.50").multiPart("data", "2026-09-20");
        if (remover) req = req.multiPart("remover_comprovante", "true");
        if (arquivo != null) req = req.multiPart("comprovante", "novo", arquivo, mime);
        return req.when().put("/financeiro/" + recurso + "/" + id);
    }

    private static void comprovanteExiste(String arquivo, int status) {
        como(admin).when().get("/financeiro/comprovantes/" + arquivo).then().statusCode(status);
    }

    // ---------- Despesas e outras receitas ----------

    @ParameterizedTest(name = "{0}: corrige descrição, valor e data")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Edição básica")
    void corrigeCampos(String recurso) {
        int id = criar(recurso, descricaoUnica(), null);
        editarJson(admin, recurso, id, Map.of("descricao", "  Corrigida  ", "valor", 250.5, "data", "2026-09-20"))
            .then().statusCode(200);
        Map<String, Object> linha = ler(recurso, id);
        org.junit.jupiter.api.Assertions.assertEquals("Corrigida", linha.get("descricao"));
        org.junit.jupiter.api.Assertions.assertEquals(250.5, ((Number) linha.get("valor")).doubleValue());
        org.junit.jupiter.api.Assertions.assertEquals("2026-09-20", linha.get("data"));
    }

    @ParameterizedTest(name = "{0}: valor 0 e centavos são aceitos")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Valores-limite")
    void valoresLimite(String recurso) {
        int id = criar(recurso, descricaoUnica(), null);
        editarJson(admin, recurso, id, Map.of("descricao", "x", "valor", 0, "data", "2026-09-20")).then().statusCode(200);
        editarJson(admin, recurso, id, Map.of("descricao", "x", "valor", 10.99, "data", "2026-09-20")).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(10.99, ((Number) ler(recurso, id).get("valor")).doubleValue());
    }

    @ParameterizedTest(name = "{0}: entradas inválidas retornam 400 e nada muda")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Validação")
    void validacao(String recurso) {
        String descricao = descricaoUnica();
        int id = criar(recurso, descricao, null);
        List<Map<String, ?>> invalidos = List.of(
            Map.of("valor", 1, "data", "2026-09-20"),                            // sem descrição
            Map.of("descricao", "   ", "valor", 1, "data", "2026-09-20"),        // descrição em branco
            Map.of("descricao", "x", "data", "2026-09-20"),                      // sem valor
            Map.of("descricao", "x", "valor", -1, "data", "2026-09-20"),         // valor negativo
            Map.of("descricao", "x", "valor", "abc", "data", "2026-09-20"),      // valor não numérico
            Map.of("descricao", "x", "valor", 1),                                // sem data
            Map.of("descricao", "x", "valor", 1, "data", "2026-13-40"),          // data inexistente
            Map.of("descricao", "x", "valor", 1, "data", "20/09/2026"));         // formato errado
        for (Map<String, ?> corpo : invalidos) {
            editarJson(admin, recurso, id, corpo).then().statusCode(400);
        }
        Map<String, Object> linha = ler(recurso, id);
        org.junit.jupiter.api.Assertions.assertEquals(descricao, linha.get("descricao"));
        org.junit.jupiter.api.Assertions.assertEquals(100.0, ((Number) linha.get("valor")).doubleValue());
    }

    @ParameterizedTest(name = "{0}: criar com valor negativo também é recusado")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Mesma validação no cadastro")
    void validacaoNoCadastro(String recurso) {
        como(admin).contentType(ContentType.JSON).body(Map.of("descricao", "x", "valor", -5, "data", "2026-09-15"))
            .when().post("/financeiro/" + recurso).then().statusCode(400);
    }

    @ParameterizedTest(name = "{0}: id inexistente retorna 404")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Lançamento inexistente")
    void inexistente(String recurso) {
        editarJson(admin, recurso, 99999999, corpoValido("x")).then().statusCode(404);
    }

    @ParameterizedTest(name = "{0}: só o admin edita")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("RBAC da edição")
    void soAdminEdita(String recurso) {
        int id = criar(recurso, descricaoUnica(), null);
        for (String token : List.of(proprietario, inquilino)) {
            editarJson(token, recurso, id, corpoValido("hack")).then().statusCode(403);
        }
        semLogin().contentType(ContentType.JSON).body(corpoValido("hack"))
            .when().put("/financeiro/" + recurso + "/" + id).then().statusCode(401);
        org.junit.jupiter.api.Assertions.assertEquals(100.0, ((Number) ler(recurso, id).get("valor")).doubleValue());
    }

    @Test
    @DisplayName("Resumo mensal reflete a edição, só no mês do lançamento")
    void resumoRefleteAEdicao() {
        int id = criar("despesas", descricaoUnica(), null);
        double antes = como(admin).queryParam("ano", 2026).queryParam("mes", 9).when().get("/financeiro/resumo/mensal")
            .then().extract().jsonPath().getDouble("despesas");
        editarJson(admin, "despesas", id, Map.of("descricao", "x", "valor", 300, "data", "2026-09-15")).then().statusCode(200);
        double depois = como(admin).queryParam("ano", 2026).queryParam("mes", 9).when().get("/financeiro/resumo/mensal")
            .then().extract().jsonPath().getDouble("despesas");
        org.junit.jupiter.api.Assertions.assertEquals(200.0, depois - antes, 0.001);

        // Mudar a data para outro mês tira o valor de setembro.
        editarJson(admin, "despesas", id, Map.of("descricao", "x", "valor", 300, "data", "2026-08-15")).then().statusCode(200);
        double semMes = como(admin).queryParam("ano", 2026).queryParam("mes", 9).when().get("/financeiro/resumo/mensal")
            .then().extract().jsonPath().getDouble("despesas");
        org.junit.jupiter.api.Assertions.assertEquals(antes - 100.0, semMes, 0.001);
    }

    // ---------- Comprovante na edição ----------

    @ParameterizedTest(name = "{0}: sem arquivo novo mantém o comprovante")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Mantém")
    void mantemComprovante(String recurso) {
        int id = criar(recurso, descricaoUnica(), PDF);
        String arquivo = (String) ler(recurso, id).get("comprovante_path");
        editarJson(admin, recurso, id, corpoValido("Editada")).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(arquivo, ler(recurso, id).get("comprovante_path"));
        comprovanteExiste(arquivo, 200);
    }

    @ParameterizedTest(name = "{0}: arquivo novo substitui e apaga o antigo")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Substitui")
    void substituiComprovante(String recurso) {
        int id = criar(recurso, descricaoUnica(), PDF);
        String antigo = (String) ler(recurso, id).get("comprovante_path");
        editarMultipart(recurso, id, JPEG, "image/jpeg", false).then().statusCode(200);
        String novo = (String) ler(recurso, id).get("comprovante_path");
        org.junit.jupiter.api.Assertions.assertNotEquals(antigo, novo);
        org.junit.jupiter.api.Assertions.assertTrue(novo.endsWith(".jpg"));
        comprovanteExiste(novo, 200);
        comprovanteExiste(antigo, 404);
    }

    @ParameterizedTest(name = "{0}: remover deixa sem comprovante e apaga o arquivo")
    @ValueSource(strings = {"despesas", "outras-receitas"})
    @DisplayName("Remove")
    void removeComprovante(String recurso) {
        int id = criar(recurso, descricaoUnica(), PDF);
        String antigo = (String) ler(recurso, id).get("comprovante_path");
        editarMultipart(recurso, id, null, null, true).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertNull(ler(recurso, id).get("comprovante_path"));
        comprovanteExiste(antigo, 404);
    }

    @Test
    @DisplayName("Arquivo inválido ou grande demais na edição não altera nada")
    void arquivoInvalidoNaoAltera() {
        String descricao = descricaoUnica();
        int id = criar("despesas", descricao, PDF);
        String arquivo = (String) ler("despesas", id).get("comprovante_path");

        editarMultipart("despesas", id, "MZ executavel".getBytes(StandardCharsets.ISO_8859_1), "application/pdf", false)
            .then().statusCode(400).body("error", containsString("PDF, JPEG ou PNG"));
        editarMultipart("despesas", id, Arrays.copyOf(PDF, 5 * 1024 * 1024 + 1), "application/pdf", false)
            .then().statusCode(413);

        Map<String, Object> linha = ler("despesas", id);
        org.junit.jupiter.api.Assertions.assertEquals(descricao, linha.get("descricao"));
        org.junit.jupiter.api.Assertions.assertEquals(100.0, ((Number) linha.get("valor")).doubleValue());
        org.junit.jupiter.api.Assertions.assertEquals(arquivo, linha.get("comprovante_path"));
        comprovanteExiste(arquivo, 200);
    }

    @Test
    @DisplayName("Remover o comprovante de um lançamento do seed não apaga o arquivo de exemplo compartilhado")
    void exemploCompartilhadoPreservado() {
        List<Map<String, Object>> comExemplo = como(admin).queryParam("ano", 2025)
            .when().get("/financeiro/despesas").then().extract().jsonPath()
            .getList("findAll { it.comprovante_path != null && it.comprovante_path.startsWith('exemplo-') }");
        org.junit.jupiter.api.Assertions.assertFalse(comExemplo.isEmpty(), "o seed deveria ter despesas com comprovante de exemplo");
        Map<String, Object> d = comExemplo.get(ThreadLocalRandom.current().nextInt(comExemplo.size()));
        String exemplo = (String) d.get("comprovante_path");

        como(admin).multiPart("descricao", (String) d.get("descricao")).multiPart("valor", String.valueOf(d.get("valor")))
            .multiPart("data", (String) d.get("data")).multiPart("remover_comprovante", "true")
            .when().put("/financeiro/despesas/" + d.get("id")).then().statusCode(200);
        comprovanteExiste(exemplo, 200); // outros lançamentos seguem usando o arquivo
    }

    // ---------- Taxas ----------

    /** Cria uma taxa de R$ 325,00 em janeiro de um ano futuro aleatório; devolve {id, ano}. */
    private static int[] novaTaxa(byte[] arquivo) {
        int ano = ThreadLocalRandom.current().nextInt(2100, 2900);
        var req = como(admin)
            .multiPart("apartamento_id", String.valueOf(ThreadLocalRandom.current().nextInt(1, 193)))
            .multiPart("mes_referencia", "1").multiPart("ano_referencia", String.valueOf(ano)).multiPart("valor", "325.00");
        if (arquivo != null) req = req.multiPart("comprovante", "t", arquivo, "application/pdf");
        int id = req.when().post("/financeiro/taxas").then().statusCode(201).extract().path("id");
        return new int[] {id, ano};
    }

    private static Map<String, Object> taxa(int[] t) {
        List<Map<String, Object>> linhas = como(admin).queryParam("ano", t[1])
            .when().get("/financeiro/taxas").then().extract().jsonPath().getList("findAll { it.id == " + t[0] + " }");
        return linhas.get(0);
    }

    private static Response editarTaxa(int[] t, Map<String, String> campos) {
        var req = como(admin);
        for (var e : campos.entrySet()) req = req.multiPart(e.getKey(), e.getValue());
        if (campos.isEmpty()) req = req.contentType(ContentType.JSON).body("{}");
        return req.when().put("/financeiro/taxas/" + t[0]);
    }

    private static double numero(Map<String, Object> m, String campo) {
        return ((Number) m.get(campo)).doubleValue();
    }

    @Test
    @DisplayName("Taxa: informar a data de pagamento calcula o juros e deixa adimplente; remover a data volta a inadimplente")
    void taxaPagaEDespaga() {
        int[] t = novaTaxa(null);
        editarTaxa(t, Map.of("data_pagamento", t[1] + "-01-20")).then().statusCode(200)
            .body("situacao", equalTo("adimplente")).body("juros", numero(7.58));
        Map<String, Object> paga = taxa(t);
        org.junit.jupiter.api.Assertions.assertEquals("adimplente", paga.get("situacao"));
        org.junit.jupiter.api.Assertions.assertEquals(0, ((Number) paga.get("meses_atraso")).intValue());

        editarTaxa(t, Map.of("data_pagamento", "")).then().statusCode(200).body("situacao", equalTo("inadimplente"));
        Map<String, Object> aberta = taxa(t);
        org.junit.jupiter.api.Assertions.assertEquals("inadimplente", aberta.get("situacao"));
        org.junit.jupiter.api.Assertions.assertNull(aberta.get("data_pagamento"));
        org.junit.jupiter.api.Assertions.assertEquals(0.0, numero(aberta, "juros"), "taxa em aberto não tem juros");
    }

    @Test
    @DisplayName("Taxa: corrigir só o valor mantém o juros gravado (não recalcula)")
    void corrigirValorNaoRecalculaJuros() {
        int[] t = novaTaxa(null);
        editarTaxa(t, Map.of("data_pagamento", t[1] + "-01-20")).then().statusCode(200);
        editarTaxa(t, Map.of("valor", "360.00")).then().statusCode(200);
        Map<String, Object> linha = taxa(t);
        org.junit.jupiter.api.Assertions.assertEquals(360.0, numero(linha, "valor"));
        org.junit.jupiter.api.Assertions.assertEquals(7.58, numero(linha, "juros"));
    }

    @Test
    @DisplayName("Taxa: juros informado prevalece; trocar a data sem juros recalcula")
    void jurosManualEDataNova() {
        int[] t = novaTaxa(null);
        editarTaxa(t, Map.of("data_pagamento", t[1] + "-01-20", "juros", "1.50")).then().statusCode(200).body("juros", numero(1.5));
        editarTaxa(t, Map.of("data_pagamento", t[1] + "-01-11")).then().statusCode(200).body("juros", numero(6.61));
    }

    @Test
    @DisplayName("Taxa: apartamento, mês e ano não mudam pela edição")
    void identidadeImutavel() {
        int[] t = novaTaxa(null);
        Map<String, Object> antes = taxa(t);
        editarTaxa(t, Map.of("apartamento_id", "1", "mes_referencia", "5", "ano_referencia", "1999", "valor", "330.00"))
            .then().statusCode(200);
        Map<String, Object> depois = taxa(t);
        org.junit.jupiter.api.Assertions.assertEquals(antes.get("apartamento_id"), depois.get("apartamento_id"));
        org.junit.jupiter.api.Assertions.assertEquals(antes.get("mes_referencia"), depois.get("mes_referencia"));
        org.junit.jupiter.api.Assertions.assertEquals(antes.get("ano_referencia"), depois.get("ano_referencia"));
    }

    @Test
    @DisplayName("Taxa: comprovante mantém, substitui e remove (com o arquivo antigo apagado)")
    void taxaComprovante() {
        int[] t = novaTaxa(PDF);
        String primeiro = (String) taxa(t).get("comprovante_path");

        editarTaxa(t, Map.of("valor", "330.00")).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertEquals(primeiro, taxa(t).get("comprovante_path"));

        como(admin).multiPart("comprovante", "novo", JPEG, "image/jpeg")
            .when().put("/financeiro/taxas/" + t[0]).then().statusCode(200);
        String segundo = (String) taxa(t).get("comprovante_path");
        org.junit.jupiter.api.Assertions.assertNotEquals(primeiro, segundo);
        comprovanteExiste(primeiro, 404);

        editarTaxa(t, Map.of("remover_comprovante", "true")).then().statusCode(200);
        org.junit.jupiter.api.Assertions.assertNull(taxa(t).get("comprovante_path"));
        comprovanteExiste(segundo, 404);
    }

    @Test
    @DisplayName("Taxa: entradas inválidas retornam 400, inexistente 404, e morador recebe 403")
    void taxaValidacaoERbac() {
        int[] t = novaTaxa(null);
        editarTaxa(t, Map.of("valor", "-1")).then().statusCode(400);
        editarTaxa(t, Map.of("valor", "abc")).then().statusCode(400);
        editarTaxa(t, Map.of("data_pagamento", "2027-02-30")).then().statusCode(400);
        editarTaxa(t, Map.of("juros", "-3", "data_pagamento", t[1] + "-01-20")).then().statusCode(400);
        org.junit.jupiter.api.Assertions.assertEquals(325.0, numero(taxa(t), "valor"));

        como(admin).multiPart("valor", "330").when().put("/financeiro/taxas/99999999").then().statusCode(404);
        como(proprietario).multiPart("valor", "1").when().put("/financeiro/taxas/" + t[0]).then().statusCode(403);
        semLogin().multiPart("valor", "1").when().put("/financeiro/taxas/" + t[0]).then().statusCode(401);
    }
}
