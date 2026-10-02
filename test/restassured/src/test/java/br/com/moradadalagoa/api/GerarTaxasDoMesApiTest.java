package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.equalTo;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Geração das taxas do mês em lote — seção 7.5 de sugestoes-de-testes.md.
 * Cada teste usa um ano futuro aleatório, porque a API não apaga taxas (192 linhas por mês gerado).
 */
class GerarTaxasDoMesApiTest extends ApiBase {

    private static final int TOTAL_APARTAMENTOS = 192;
    private static String admin;
    private static String proprietario;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
    }

    private static int anoLivre() {
        return ThreadLocalRandom.current().nextInt(2100, 2900);
    }

    private static Response gerar(String token, Object mes, Object ano) {
        return como(token).contentType(ContentType.JSON)
            .body(Map.of("mes_referencia", mes, "ano_referencia", ano))
            .when().post("/financeiro/taxas/gerar-mes");
    }

    private static List<Map<String, Object>> taxasDe(int ano, int mes) {
        return como(admin).queryParam("ano", ano).queryParam("mes", mes)
            .when().get("/financeiro/taxas").then().statusCode(200)
            .extract().jsonPath().getList("$");
    }

    @Test
    @DisplayName("Cria uma taxa por apartamento com o valor do ano, em aberto e sem juros nem comprovante")
    void criaUmaPorApartamento() {
        int ano = anoLivre();
        definirTaxaDoAno(admin, ano, 340);

        gerar(admin, 1, ano).then().statusCode(201)
            .body("criadas", equalTo(TOTAL_APARTAMENTOS)).body("ignoradas", equalTo(0)).body("valor", equalTo(340.0f));

        List<Map<String, Object>> taxas = taxasDe(ano, 1);
        org.junit.jupiter.api.Assertions.assertEquals(TOTAL_APARTAMENTOS, taxas.size());
        for (Map<String, Object> t : taxas) {
            org.junit.jupiter.api.Assertions.assertEquals(340.0, ((Number) t.get("valor")).doubleValue());
            org.junit.jupiter.api.Assertions.assertEquals("inadimplente", t.get("situacao"));
            org.junit.jupiter.api.Assertions.assertEquals(0.0, ((Number) t.get("juros")).doubleValue());
            org.junit.jupiter.api.Assertions.assertNull(t.get("data_pagamento"));
            org.junit.jupiter.api.Assertions.assertNull(t.get("comprovante_path"));
        }
    }

    @Test
    @DisplayName("Idempotente: gerar de novo o mesmo mês não cria nem altera nada")
    void idempotente() {
        int ano = anoLivre();
        definirTaxaDoAno(admin, ano, 340);
        gerar(admin, 2, ano).then().statusCode(201);
        gerar(admin, 2, ano).then().statusCode(201)
            .body("criadas", equalTo(0)).body("ignoradas", equalTo(TOTAL_APARTAMENTOS));
        org.junit.jupiter.api.Assertions.assertEquals(TOTAL_APARTAMENTOS, taxasDe(ano, 2).size());
    }

    @Test
    @DisplayName("Mês parcialmente lançado: cria só as que faltam e preserva o valor das existentes")
    void parcialmenteLancado() {
        int ano = anoLivre();
        definirTaxaDoAno(admin, ano, 340);
        como(admin).contentType(ContentType.JSON)
            .body(Map.of("apartamento_id", 3, "mes_referencia", 3, "ano_referencia", ano, "valor", 999))
            .when().post("/financeiro/taxas").then().statusCode(201);

        gerar(admin, 3, ano).then().statusCode(201)
            .body("criadas", equalTo(TOTAL_APARTAMENTOS - 1)).body("ignoradas", equalTo(1));

        List<Map<String, Object>> taxas = taxasDe(ano, 3);
        org.junit.jupiter.api.Assertions.assertEquals(TOTAL_APARTAMENTOS, taxas.size());
        long com999 = taxas.stream().filter(t -> ((Number) t.get("valor")).doubleValue() == 999.0).count();
        org.junit.jupiter.api.Assertions.assertEquals(1, com999, "a taxa lançada à mão não foi sobrescrita");
    }

    @Test
    @DisplayName("Ano sem valor configurado retorna 400 e não cria nada")
    void anoSemValor() {
        int ano = ThreadLocalRandom.current().nextInt(1900, 1950);
        gerar(admin, 1, ano).then().statusCode(400);
        org.junit.jupiter.api.Assertions.assertEquals(0, taxasDe(ano, 1).size());
    }

    @Test
    @DisplayName("Mês ou ano inválidos retornam 400")
    void parametrosInvalidos() {
        definirTaxaDoAno(admin, 2800, 340);
        gerar(admin, 0, 2800).then().statusCode(400);
        gerar(admin, 13, 2800).then().statusCode(400);
        gerar(admin, "abc", 2800).then().statusCode(400);
        como(admin).contentType(ContentType.JSON).body(Map.of("mes_referencia", 1))
            .when().post("/financeiro/taxas/gerar-mes").then().statusCode(400);
    }

    @Test
    @DisplayName("Só o admin gera taxas")
    void soAdmin() {
        gerar(proprietario, 1, 2800).then().statusCode(403);
        gerar(login(INQUILINO), 1, 2800).then().statusCode(403);
        semLogin().contentType(ContentType.JSON).body(Map.of("mes_referencia", 1, "ano_referencia", 2800))
            .when().post("/financeiro/taxas/gerar-mes").then().statusCode(401);
    }
}
