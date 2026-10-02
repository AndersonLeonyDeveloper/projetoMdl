package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;

import io.restassured.http.ContentType;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Configurações financeiras (valor da taxa por ano, multa, juros e vencimento) — seção 7.5 de sugestoes-de-testes.md.
 * Altera o estado global da aplicação, então restaura multa, juros e vencimento ao final.
 */
class ConfiguracoesFinanceirasApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;
    private static String inquilino;
    private static Map<String, Object> original;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
        inquilino = login(INQUILINO);
        original = lerConfiguracao(admin);
    }

    @BeforeEach
    void cadaTesteComecaNoOriginal() {
        restaurar();
    }

    @AfterAll
    static void restaurar() {
        salvarConfiguracao(admin,
            ((Number) original.get("multa_percentual")).doubleValue(),
            ((Number) original.get("juros_mensal_percentual")).doubleValue(),
            ((Number) original.get("dia_vencimento")).intValue());
    }

    private static io.restassured.response.Response put(String token, Object corpo) {
        return como(token).contentType(ContentType.JSON).body(corpo).when().put("/financeiro/configuracoes");
    }

    @Test
    @DisplayName("Leitura liberada para todos os perfis autenticados; sem token, 401")
    void leitura() {
        for (String token : List.of(admin, proprietario, inquilino)) {
            como(token).when().get("/financeiro/configuracoes")
                .then().statusCode(200)
                .body("multa_percentual", numero(((Number) original.get("multa_percentual")).doubleValue()))
                .body("juros_mensal_percentual", numero(((Number) original.get("juros_mensal_percentual")).doubleValue()))
                .body("dia_vencimento", equalTo(((Number) original.get("dia_vencimento")).intValue()));
        }
        semLogin().when().get("/financeiro/configuracoes").then().statusCode(401);
    }

    @Test
    @DisplayName("Seed: valores da taxa de 2020 a 2026")
    void valoresDoSeed() {
        como(admin).when().get("/financeiro/configuracoes").then().statusCode(200)
            .body("taxas_padrao.find { it.ano == 2020 }.valor", numero(230.0))
            .body("taxas_padrao.find { it.ano == 2023 }.valor", numero(280.0))
            .body("taxas_padrao.find { it.ano == 2026 }.valor", numero(325.0));
    }

    @Test
    @DisplayName("Alteração é restrita ao admin")
    void alteracaoSoParaAdmin() {
        for (String token : List.of(proprietario, inquilino)) {
            put(token, Map.of("multa_percentual", 1)).then().statusCode(403);
        }
        semLogin().contentType(ContentType.JSON).body(Map.of("multa_percentual", 1))
            .when().put("/financeiro/configuracoes").then().statusCode(401);
    }

    @ParameterizedTest(name = "{0} é recusado (400)")
    @ValueSource(strings = {
        "{\"multa_percentual\": 3}", "{\"multa_percentual\": -1}", "{\"juros_mensal_percentual\": -0.5}",
        "{\"dia_vencimento\": 29}", "{\"dia_vencimento\": 0}", "{\"dia_vencimento\": 5.5}",
        "{\"multa_percentual\": \"abc\"}", "{\"taxas_padrao\": \"x\"}",
        "{\"taxas_padrao\": [{\"ano\": 2800, \"valor\": -1}]}", "{\"taxas_padrao\": [{\"valor\": 100}]}"})
    @DisplayName("Validações dos parâmetros")
    void validacoes(String corpo) {
        como(admin).contentType(ContentType.JSON).body(corpo)
            .when().put("/financeiro/configuracoes").then().statusCode(400);
        // nada foi salvo
        como(admin).when().get("/financeiro/configuracoes").then()
            .body("multa_percentual", numero(((Number) original.get("multa_percentual")).doubleValue()))
            .body("dia_vencimento", equalTo(((Number) original.get("dia_vencimento")).intValue()));
    }

    @Test
    @DisplayName("Valores-limite aceitos: multa 0 e 2, vencimento 1 e 28")
    void valoresLimite() {
        put(admin, Map.of("multa_percentual", 0, "dia_vencimento", 1)).then().statusCode(200)
            .body("multa_percentual", numero(0.0)).body("dia_vencimento", equalTo(1));
        put(admin, Map.of("multa_percentual", 2, "dia_vencimento", 28)).then().statusCode(200)
            .body("multa_percentual", numero(2.0)).body("dia_vencimento", equalTo(28));
    }

    @Test
    @DisplayName("Valor da taxa por ano: cria, atualiza e não altera taxas já lançadas")
    void valorDaTaxaPorAno() {
        int ano = ThreadLocalRandom.current().nextInt(2100, 2900);
        definirTaxaDoAno(admin, ano, 340);
        como(admin).when().get("/financeiro/configuracoes").then()
            .body("taxas_padrao.find { it.ano == " + ano + " }.valor", numero(340.0));
        definirTaxaDoAno(admin, ano, 355.5);
        como(admin).when().get("/financeiro/configuracoes").then()
            .body("taxas_padrao.find { it.ano == " + ano + " }.valor", numero(355.5))
            .body("taxas_padrao.ano", hasItem(2026));

        // Alterar o valor de 2026 não muda as taxas de 2026 já lançadas.
        double antes = como(admin).queryParam("ano", 2026).queryParam("mes", 3)
            .when().get("/financeiro/taxas").then().extract().jsonPath().getDouble("[0].valor");
        definirTaxaDoAno(admin, 2026, 999);
        double depois = como(admin).queryParam("ano", 2026).queryParam("mes", 3)
            .when().get("/financeiro/taxas").then().extract().jsonPath().getDouble("[0].valor");
        definirTaxaDoAno(admin, 2026, 325);
        org.junit.jupiter.api.Assertions.assertEquals(antes, depois);
    }
}
