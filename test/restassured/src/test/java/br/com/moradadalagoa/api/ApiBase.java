package br.com.moradadalagoa.api;

import static io.restassured.RestAssured.given;

import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import java.util.Map;

/** Configuração comum: URL da API e login por perfil (token Bearer). */
public abstract class ApiBase {

    protected static final String API_URL = System.getProperty("apiUrl", "http://localhost:3001/api");
    protected static final String SENHA = "senha123";

    protected static final String ADMIN = "admin@condominio.com";
    protected static final String PROPRIETARIO = "anderson@example.com";
    protected static final String INQUILINO = "carlos.inquilino@example.com";

    protected static String login(String email) {
        return given()
            .baseUri(API_URL)
            .contentType(ContentType.JSON)
            .body(Map.of("email", email, "senha", SENHA))
        .when()
            .post("/auth/login")
        .then()
            .statusCode(200)
            .extract().path("token");
    }

    protected static RequestSpecification como(String token) {
        return given().baseUri(API_URL).header("Authorization", "Bearer " + token);
    }

    protected static RequestSpecification semLogin() {
        return given().baseUri(API_URL);
    }

    // ---------- Configurações financeiras (estado global: sempre restaurar ao final) ----------

    protected static Map<String, Object> lerConfiguracao(String token) {
        return como(token).when().get("/financeiro/configuracoes")
            .then().statusCode(200).extract().jsonPath().getMap("$");
    }

    protected static void salvarConfiguracao(String token, double multa, double jurosMensal, int diaVencimento) {
        como(token).contentType(ContentType.JSON)
            .body(Map.of("multa_percentual", multa, "juros_mensal_percentual", jurosMensal, "dia_vencimento", diaVencimento))
            .when().put("/financeiro/configuracoes")
            .then().statusCode(200);
    }

    protected static void definirTaxaDoAno(String token, int ano, double valor) {
        como(token).contentType(ContentType.JSON)
            .body(Map.of("taxas_padrao", java.util.List.of(Map.of("ano", ano, "valor", valor))))
            .when().put("/financeiro/configuracoes")
            .then().statusCode(200);
    }
}
