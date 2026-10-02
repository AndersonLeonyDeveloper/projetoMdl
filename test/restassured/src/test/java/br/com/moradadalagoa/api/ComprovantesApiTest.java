package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.startsWith;

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

/**
 * Comprovantes (upload e visualização) — cenários da seção 7.4 de sugestoes-de-testes.md.
 *
 * Pré-requisito: banco com `npm run db:seed && npm run db:seed:financeiro` (usuários de teste + histórico
 * financeiro + comprovantes de exemplo). Os testes criam lançamentos que não podem ser apagados pela API.
 */
class ComprovantesApiTest extends ApiBase {

    private static final byte[] PDF = "%PDF-1.4\n% comprovante de teste\n".getBytes(StandardCharsets.ISO_8859_1);
    private static final byte[] JPEG = {
        (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01
    };
    private static final byte[] PNG = {
        (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
    };
    private static final int LIMITE_BYTES = 5 * 1024 * 1024;

    private static String admin;
    private static String proprietario;
    private static String inquilino;

    @BeforeAll
    static void logins() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
        inquilino = login(INQUILINO);
    }

    // ---------- Helpers ----------

    private static Response lancar(String recurso, String descricao, byte[] arquivo, String nomeArquivo, String mime) {
        var req = como(admin)
            .multiPart("descricao", descricao)
            .multiPart("valor", "10.50")
            .multiPart("data", "2026-09-15");
        if (arquivo != null) req = req.multiPart("comprovante", nomeArquivo, arquivo, mime);
        return req.when().post("/financeiro/" + recurso);
    }

    private static String descricaoUnica() {
        return "Teste API " + UUID.randomUUID();
    }

    /** Busca o lançamento pela descrição e devolve o comprovante_path (ou null). */
    private static String comprovanteDe(String recurso, String descricao) {
        List<Map<String, Object>> linhas = como(admin)
            .queryParam("ano", 2026).queryParam("mes", 9)
            .when().get("/financeiro/" + recurso)
            .then().statusCode(200)
            .extract().jsonPath().getList("findAll { it.descricao == '" + descricao + "' }");
        org.junit.jupiter.api.Assertions.assertEquals(1, linhas.size(), "lançamento criado deve aparecer na listagem");
        return (String) linhas.get(0).get("comprovante_path");
    }

    private static Response lancarTaxa(byte[] arquivo, String mime) {
        var req = como(admin)
            .multiPart("apartamento_id", String.valueOf(ThreadLocalRandom.current().nextInt(1, 193)))
            .multiPart("mes_referencia", String.valueOf(ThreadLocalRandom.current().nextInt(1, 13)))
            .multiPart("ano_referencia", String.valueOf(ThreadLocalRandom.current().nextInt(2100, 2900)))
            .multiPart("valor", "325.00");
        if (arquivo != null) req = req.multiPart("comprovante", "taxa", arquivo, mime);
        return req.when().post("/financeiro/taxas");
    }

    // ---------- Upload válido ----------

    @ParameterizedTest(name = "{0}: PDF anexado é salvo e pode ser baixado")
    @ValueSource(strings = {"outras-receitas", "despesas"})
    @DisplayName("Upload de PDF válido em receita e despesa")
    void uploadDePdfValido(String recurso) {
        String descricao = descricaoUnica();
        lancar(recurso, descricao, PDF, "recibo.pdf", "application/pdf")
            .then().statusCode(201).body("id", notNullValue());

        String arquivo = comprovanteDe(recurso, descricao);
        org.junit.jupiter.api.Assertions.assertTrue(arquivo.endsWith(".pdf"), "extensão definida pelo servidor");

        como(proprietario).when().get("/financeiro/comprovantes/" + arquivo)
            .then().statusCode(200)
            .contentType("application/pdf")
            .header("X-Content-Type-Options", equalTo("nosniff"))
            .body(startsWith("%PDF"));
    }

    @Test
    @DisplayName("Upload de JPEG e de PNG válidos")
    void uploadDeImagensValidas() {
        String jpeg = descricaoUnica();
        lancar("despesas", jpeg, JPEG, "foto.jpg", "image/jpeg").then().statusCode(201);
        String arquivoJpeg = comprovanteDe("despesas", jpeg);
        org.junit.jupiter.api.Assertions.assertTrue(arquivoJpeg.endsWith(".jpg"));
        como(admin).when().get("/financeiro/comprovantes/" + arquivoJpeg)
            .then().statusCode(200).contentType("image/jpeg");

        String png = descricaoUnica();
        lancar("despesas", png, PNG, "foto.png", "image/png").then().statusCode(201);
        String arquivoPng = comprovanteDe("despesas", png);
        org.junit.jupiter.api.Assertions.assertTrue(arquivoPng.endsWith(".png"));
        como(admin).when().get("/financeiro/comprovantes/" + arquivoPng)
            .then().statusCode(200).contentType("image/png");
    }

    @Test
    @DisplayName("Nome do arquivo salvo é gerado pelo servidor, não o enviado")
    void nomeDoArquivoEGeradoPeloServidor() {
        String descricao = descricaoUnica();
        lancar("despesas", descricao, PDF, "../../etc/passwd.pdf", "application/pdf").then().statusCode(201);
        String arquivo = comprovanteDe("despesas", descricao);
        org.junit.jupiter.api.Assertions.assertTrue(
            arquivo.matches("[0-9a-f-]{36}\\.pdf"), "esperado UUID.pdf, veio: " + arquivo);
    }

    @Test
    @DisplayName("Lançamento sem comprovante continua válido (campo opcional)")
    void semComprovante() {
        String descricao = descricaoUnica();
        lancar("outras-receitas", descricao, null, null, null).then().statusCode(201);
        org.junit.jupiter.api.Assertions.assertNull(comprovanteDe("outras-receitas", descricao));
    }

    @Test
    @DisplayName("Envio em JSON (sem multipart) continua aceito")
    void envioEmJson() {
        como(admin).contentType(ContentType.JSON)
            .body(Map.of("descricao", descricaoUnica(), "valor", 10.5, "data", "2026-09-15"))
            .when().post("/financeiro/despesas")
            .then().statusCode(201);
    }

    @Test
    @DisplayName("comprovante_path enviado no corpo é ignorado")
    void comprovantePathNoCorpoEIgnorado() {
        String descricao = descricaoUnica();
        como(admin).contentType(ContentType.JSON)
            .body(Map.of("descricao", descricao, "valor", 10.5, "data", "2026-09-15",
                "comprovante_path", "exemplo-despesa-1.pdf"))
            .when().post("/financeiro/despesas")
            .then().statusCode(201);
        org.junit.jupiter.api.Assertions.assertNull(comprovanteDe("despesas", descricao));
    }

    // ---------- Taxa de condomínio ----------

    @Test
    @DisplayName("Taxa: comprovante no lançamento e no registro de pagamento")
    void comprovanteNaTaxa() {
        int id = lancarTaxa(PDF, "application/pdf").then().statusCode(201).extract().path("id");

        // Pagamento com novo comprovante (JPEG) substitui o anterior e muda a situação.
        como(admin)
            .multiPart("data_pagamento", "2026-09-20")
            .multiPart("comprovante", "pagamento", JPEG, "image/jpeg")
            .when().put("/financeiro/taxas/" + id + "/pagamento")
            .then().statusCode(200);

        List<Map<String, Object>> taxas = como(admin).when().get("/financeiro/taxas")
            .then().statusCode(200).extract().jsonPath().getList("findAll { it.id == " + id + " }");
        org.junit.jupiter.api.Assertions.assertEquals(1, taxas.size());
        org.junit.jupiter.api.Assertions.assertEquals("adimplente", taxas.get(0).get("situacao"));
        org.junit.jupiter.api.Assertions.assertTrue(((String) taxas.get(0).get("comprovante_path")).endsWith(".jpg"));
    }

    @Test
    @DisplayName("Pagamento sem arquivo preserva o comprovante já anexado")
    void pagamentoSemArquivoPreservaComprovante() {
        int id = lancarTaxa(PDF, "application/pdf").then().statusCode(201).extract().path("id");
        como(admin).multiPart("data_pagamento", "2026-09-20")
            .when().put("/financeiro/taxas/" + id + "/pagamento").then().statusCode(200);

        List<Map<String, Object>> taxas = como(admin).when().get("/financeiro/taxas")
            .then().extract().jsonPath().getList("findAll { it.id == " + id + " }");
        org.junit.jupiter.api.Assertions.assertTrue(((String) taxas.get(0).get("comprovante_path")).endsWith(".pdf"));
    }

    // ---------- Validação do arquivo ----------

    @Test
    @DisplayName("Conteúdo que não é PDF/JPEG/PNG é recusado mesmo com tipo declarado válido")
    void conteudoFalsoComTipoValido() {
        Response r = lancar("despesas", descricaoUnica(),
            "MZ conteudo executavel".getBytes(StandardCharsets.ISO_8859_1), "virus.pdf", "application/pdf");
        r.then().statusCode(400).body("error", containsString("PDF, JPEG ou PNG"));
    }

    @Test
    @DisplayName("Tipo não permitido (HTML) é recusado")
    void tipoNaoPermitido() {
        lancar("despesas", descricaoUnica(), "<html></html>".getBytes(StandardCharsets.UTF_8), "x.html", "text/html")
            .then().statusCode(400).body("error", containsString("PDF, JPEG ou PNG"));
    }

    @Test
    @DisplayName("Arquivo recusado não cria o lançamento")
    void arquivoRecusadoNaoCriaLancamento() {
        String descricao = descricaoUnica();
        lancar("despesas", descricao, "<html></html>".getBytes(StandardCharsets.UTF_8), "x.html", "text/html")
            .then().statusCode(400);
        como(admin).queryParam("ano", 2026).queryParam("mes", 9)
            .when().get("/financeiro/despesas")
            .then().statusCode(200)
            .body("findAll { it.descricao == '" + descricao + "' }", empty());
    }

    @Test
    @DisplayName("Limite de tamanho: 5 MB passa, acima disso retorna 413")
    void limiteDeTamanho() {
        byte[] noLimite = Arrays.copyOf(PDF, LIMITE_BYTES);
        lancar("despesas", descricaoUnica(), noLimite, "limite.pdf", "application/pdf").then().statusCode(201);

        byte[] acima = Arrays.copyOf(PDF, LIMITE_BYTES + 1);
        lancar("despesas", descricaoUnica(), acima, "grande.pdf", "application/pdf")
            .then().statusCode(413).body("error", containsString("5 MB"));
    }

    @Test
    @DisplayName("Campos obrigatórios continuam validados quando há arquivo")
    void camposObrigatoriosComArquivo() {
        como(admin).multiPart("valor", "10.50").multiPart("comprovante", "r.pdf", PDF, "application/pdf")
            .when().post("/financeiro/despesas")
            .then().statusCode(400);
    }

    // ---------- Autorização ----------

    @Test
    @DisplayName("Visualizar comprovante exige login (401 sem token)")
    void visualizarSemToken() {
        semLogin().when().get("/financeiro/comprovantes/exemplo-despesa-1.pdf").then().statusCode(401);
    }

    @Test
    @DisplayName("Proprietário e inquilino conseguem visualizar comprovantes")
    void moradoresVisualizam() {
        for (String token : List.of(proprietario, inquilino)) {
            como(token).when().get("/financeiro/comprovantes/exemplo-receita-1.jpg")
                .then().statusCode(200).contentType("image/jpeg");
        }
    }

    @ParameterizedTest(name = "{0}: morador não pode anexar comprovante (403)")
    @ValueSource(strings = {"outras-receitas", "despesas"})
    @DisplayName("Upload é restrito ao admin")
    void uploadSoParaAdmin(String recurso) {
        for (String token : List.of(proprietario, inquilino)) {
            como(token)
                .multiPart("descricao", descricaoUnica()).multiPart("valor", "10").multiPart("data", "2026-09-15")
                .multiPart("comprovante", "r.pdf", PDF, "application/pdf")
                .when().post("/financeiro/" + recurso)
                .then().statusCode(403);
        }
    }

    // ---------- Acesso ao arquivo ----------

    @Test
    @DisplayName("Path traversal, extensão inválida e arquivo inexistente retornam 404")
    void acessoInvalidoAoArquivo() {
        for (String alvo : List.of(
            "..%2Fcondominio.sqlite", "..%2F..%2Fpackage.json", "%2E%2E%2Fcondominio.sqlite",
            "condominio.sqlite", ".env", "nao-existe.pdf")) {
            como(admin).urlEncodingEnabled(false)
                .when().get("/financeiro/comprovantes/" + alvo)
                .then().statusCode(404);
        }
    }

    // ---------- Dados de demonstração (seed) ----------

    @ParameterizedTest(name = "{0} está disponível")
    @ValueSource(strings = {
        "exemplo-taxa-1.pdf", "exemplo-taxa-2.jpg", "exemplo-receita-1.pdf",
        "exemplo-receita-2.jpg", "exemplo-despesa-1.pdf", "exemplo-despesa-2.jpg"})
    @DisplayName("Comprovantes de exemplo gerados pelo seed")
    void comprovantesDeExemplo(String arquivo) {
        como(admin).when().get("/financeiro/comprovantes/" + arquivo).then().statusCode(200);
    }

    @Test
    @DisplayName("Seed: taxas em aberto não têm comprovante; parte das pagas e das despesas têm")
    void seedDistribuiComprovantes() {
        var taxas = como(admin).queryParam("ano", 2026).when().get("/financeiro/taxas").then().statusCode(200);
        taxas.body("findAll { it.situacao == 'inadimplente' && it.comprovante_path != null }", empty());
        taxas.body("findAll { it.situacao == 'adimplente' && it.comprovante_path != null }.size()",
            org.hamcrest.Matchers.greaterThan(0));

        como(admin).queryParam("ano", 2025).when().get("/financeiro/despesas").then().statusCode(200)
            .body("findAll { it.comprovante_path != null }.size()", org.hamcrest.Matchers.greaterThan(0));
    }
}
