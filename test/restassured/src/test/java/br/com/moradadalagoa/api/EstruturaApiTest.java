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
 * Blocos e apartamentos (`POST /blocos`, `POST /apartamentos`) — seção 7.12 de sugestoes-de-testes.md e
 * regras-de-negocio.md, seção 3.4. Não há exclusão, então os testes deixam blocos e apartamentos novos no banco
 * (com números aleatórios); `GerarTaxasDoMesApiTest` lê a quantidade de apartamentos em vez de assumir 192.
 */
class EstruturaApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
    }

    private static String sufixoAleatorio() {
        String letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        StringBuilder sb = new StringBuilder("T");
        for (int i = 0; i < 4; i++) sb.append(letras.charAt(ThreadLocalRandom.current().nextInt(letras.length())));
        return sb.toString(); // 5 caracteres, sempre começa com T para não colidir com 01–12
    }

    private static Response bloco(String token, Object numero) {
        return como(token).contentType(ContentType.JSON).body(Map.of("numero", numero)).when().post("/blocos");
    }

    private static Response apartamento(String token, Object blocoId, Object numero) {
        return como(token).contentType(ContentType.JSON).body(Map.of("bloco_id", blocoId, "numero", numero))
            .when().post("/apartamentos");
    }

    private static int novoBloco() {
        return bloco(admin, sufixoAleatorio()).then().statusCode(201).extract().path("id");
    }

    private static int totalApartamentos() {
        return como(admin).queryParam("mes_referencia", 1).queryParam("ano_referencia", 1900)
            .when().get("/financeiro/taxas/gerar-mes/previa").then().statusCode(200).extract().path("total_apartamentos");
    }

    // ---------- Blocos ----------

    @Test
    @DisplayName("Cria bloco, devolve o número normalizado (maiúsculas) e recusa duplicado, inclusive trocando maiúsculas e minúsculas")
    void criaBloco() {
        String numero = sufixoAleatorio();
        bloco(admin, numero.toLowerCase()).then().statusCode(201).body("numero", equalTo(numero)).body("id", org.hamcrest.Matchers.notNullValue());
        bloco(admin, numero).then().statusCode(409);
        como(admin).when().get("/blocos").then().statusCode(200).body("numero", org.hamcrest.Matchers.hasItem(numero));
    }

    @Test
    @DisplayName("Um dígito vira dois (5 → 05), então não dá para criar um bloco duplicado de 01–09")
    void umDigitoViraDois() {
        bloco(admin, "5").then().statusCode(409); // 05 já existe na estrutura padrão
        bloco(admin, 5).then().statusCode(409);   // também como número JSON
    }

    @Test
    @DisplayName("Número de bloco inválido (vazio, espaços, caracteres especiais, longo demais) retorna 400")
    void blocoInvalido() {
        for (String numero : List.of("", " ", "1 2", "bloco!", "../x", "123456")) {
            bloco(admin, numero).then().statusCode(400);
        }
        como(admin).contentType(ContentType.JSON).body("{}").when().post("/blocos").then().statusCode(400);
    }

    // ---------- Apartamentos ----------

    @Test
    @DisplayName("Cria apartamento num bloco, recusa duplicado no mesmo bloco e aceita o mesmo número em outro bloco")
    void criaApartamento() {
        int a = novoBloco();
        int b = novoBloco();
        apartamento(admin, a, "101").then().statusCode(201).body("numero", equalTo("101")).body("bloco_id", equalTo(a));
        apartamento(admin, a, "101").then().statusCode(409);
        apartamento(admin, b, "101").then().statusCode(201);
        como(admin).queryParam("bloco_id", a).when().get("/apartamentos").then().statusCode(200)
            .body("numero", org.hamcrest.Matchers.hasItem("101"));
    }

    @Test
    @DisplayName("Bloco inexistente retorna 404 (e não erro interno)")
    void blocoInexistente() {
        apartamento(admin, 99999999, "101").then().statusCode(404);
    }

    @Test
    @DisplayName("Número de apartamento inválido ou campos ausentes retornam 400")
    void apartamentoInvalido() {
        int bloco = novoBloco();
        for (String numero : List.of("", "  ", "1 2", "10$", "abcdefg")) {
            apartamento(admin, bloco, numero).then().statusCode(400);
        }
        como(admin).contentType(ContentType.JSON).body(Map.of("numero", "1")).when().post("/apartamentos").then().statusCode(400);
        como(admin).contentType(ContentType.JSON).body(Map.of("bloco_id", bloco)).when().post("/apartamentos").then().statusCode(400);
    }

    @Test
    @DisplayName("Um apartamento novo aumenta o total usado na geração de taxas em lote")
    void apartamentoNovoEntraNoLote() {
        int bloco = novoBloco();
        int antes = totalApartamentos();
        apartamento(admin, bloco, "1").then().statusCode(201);
        org.junit.jupiter.api.Assertions.assertEquals(antes + 1, totalApartamentos());
    }

    // ---------- Acesso ----------

    @Test
    @DisplayName("Só o admin cria; morador recebe 403; sem token, 401; qualquer perfil lista")
    void acesso() {
        bloco(proprietario, sufixoAleatorio()).then().statusCode(403);
        apartamento(proprietario, 1, "9").then().statusCode(403);
        semLogin().contentType(ContentType.JSON).body(Map.of("numero", "T0001")).when().post("/blocos").then().statusCode(401);
        como(proprietario).when().get("/blocos").then().statusCode(200);
        como(proprietario).when().get("/apartamentos").then().statusCode(200);
    }
}
