package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.notNullValue;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Configuração do condomínio (`/condominio`) — seção 7.20 de sugestoes-de-testes.md e regras-de-negocio.md, seção 3.5.
 * A suíte roda contra um banco já configurado (`npm run db:populate`), então o primeiro acesso (POST /condominio) só
 * pode ser testado pelo lado da recusa (409); o fluxo completo num banco vazio está no roteiro E2E.
 * Os nomes exibidos são estado global: cada teste que os muda restaura o original ao final.
 */
class ConfiguracaoCondominioApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;
    private static Map<String, Object> originais;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
        originais = estado(admin);
    }

    @AfterEach
    void restaurar() {
        como(admin).contentType(ContentType.JSON).body(rotulosDe(originais)).when().put("/condominio/rotulos")
            .then().statusCode(200);
    }

    private static Map<String, Object> estado(String token) {
        return como(token).when().get("/condominio").then().statusCode(200).extract().jsonPath().getMap("$");
    }

    private static Map<String, Object> rotulosDe(Map<String, Object> estado) {
        Map<String, Object> r = new HashMap<>();
        for (String campo : List.of("nome", "agrupador_singular", "agrupador_plural", "agrupador_genero", "agrupador_abrev",
            "unidade_singular", "unidade_plural", "unidade_genero", "unidade_abrev", "rotulo_terreo")) {
            r.put(campo, estado.get(campo));
        }
        return r;
    }

    private static Map<String, Object> geometria(int agrupadores, int andares, boolean terreo, int porAndar, String formato) {
        Map<String, Object> g = new HashMap<>();
        g.put("agrupadores", agrupadores);
        g.put("andares", andares);
        g.put("tem_terreo", terreo);
        g.put("unidades_por_andar", porAndar);
        g.put("formato_numeracao", formato);
        return g;
    }

    private static Response previa(String token, Map<String, Object> corpo) {
        return como(token).contentType(ContentType.JSON).body(corpo).when().post("/condominio/previa");
    }

    // ---------- Estado ----------

    @Test
    @DisplayName("Qualquer perfil logado lê o estado; sem login retorna 401")
    void leEstado() {
        for (String token : List.of(admin, proprietario, login(INQUILINO))) {
            como(token).when().get("/condominio").then().statusCode(200)
                .body("configurado", equalTo(true))
                .body("agrupador_singular", notNullValue())
                .body("unidade_singular", notNullValue())
                .body("total_de_unidades", greaterThanOrEqualTo(192));
        }
        semLogin().when().get("/condominio").then().statusCode(401);
    }

    @Test
    @DisplayName("Banco de demonstração: Bloco/Apartamento, 12 blocos de 16, térreo + 3 andares, 4 por andar")
    void demonstracao() {
        como(admin).when().get("/condominio").then().statusCode(200)
            .body("agrupador_singular", equalTo("Bloco"))
            .body("unidade_singular", equalTo("Apartamento"))
            .body("agrupador_abrev", equalTo("Bl."))
            .body("unidade_abrev", equalTo("Ap."))
            .body("tem_terreo", equalTo(1))
            .body("andares", equalTo(3))
            .body("unidades_por_andar", equalTo(4));
    }

    // ---------- Prévia ----------

    @Test
    @DisplayName("Prévia por andar: 3 torres, 2 andares, sem térreo, 3 por andar = 18 unidades (101–103, 201–203)")
    void previaPorAndar() {
        previa(admin, geometria(3, 2, false, 3, "andar_sequencia")).then().statusCode(200)
            .body("agrupadores", equalTo(3))
            .body("unidades_por_agrupador", equalTo(6))
            .body("total_de_unidades", equalTo(18))
            .body("exemplo_agrupadores", contains("01", "02", "03"))
            .body("exemplo_andares[0].andar", equalTo("1º andar"))
            .body("exemplo_andares[0].numeros", contains("101", "102", "103"))
            .body("exemplo_andares[1].numeros", contains("201", "202", "203"));
    }

    @Test
    @DisplayName("Prévia com térreo reproduz a estrutura padrão: 01–04 no térreo e 101–104 no 1º andar")
    void previaComTerreo() {
        previa(admin, geometria(12, 3, true, 4, "andar_sequencia")).then().statusCode(200)
            .body("total_de_unidades", equalTo(192))
            .body("exemplo_andares[0].andar", equalTo("Térreo"))
            .body("exemplo_andares[0].numeros", contains("01", "02", "03", "04"))
            .body("exemplo_andares[1].numeros", contains("101", "102", "103", "104"));
    }

    @Test
    @DisplayName("Numeração sequencial ignora o andar: 01, 02, 03… dentro do agrupador")
    void previaSequencial() {
        previa(admin, geometria(2, 2, true, 2, "sequencia")).then().statusCode(200)
            .body("unidades_por_agrupador", equalTo(6))
            .body("exemplo_andares[0].numeros", contains("01", "02"))
            .body("exemplo_andares[2].numeros", contains("05", "06"));
    }

    @Test
    @DisplayName("Sem andares (casas): só uma lista de unidades por agrupador, sem rótulo de andar")
    void previaSemAndares() {
        Map<String, Object> corpo = geometria(2, 0, false, 5, "andar_sequencia");
        corpo.put("sem_andares", true);
        previa(admin, corpo).then().statusCode(200)
            .body("total_de_unidades", equalTo(10))
            .body("exemplo_andares[0].andar", org.hamcrest.Matchers.nullValue())
            .body("exemplo_andares[0].numeros", contains("01", "02", "03", "04", "05"));
    }

    @Test
    @DisplayName("Prévia inválida retorna 400: zero agrupadores, nenhum andar nem térreo, zero por andar, formato desconhecido, total excessivo")
    void previaInvalida() {
        previa(admin, geometria(0, 2, false, 3, "andar_sequencia")).then().statusCode(400);
        previa(admin, geometria(2, 0, false, 3, "andar_sequencia")).then().statusCode(400);
        previa(admin, geometria(2, 2, false, 0, "andar_sequencia")).then().statusCode(400);
        previa(admin, geometria(2, 2, false, 3, "aleatorio")).then().statusCode(400);
        previa(admin, geometria(200, 100, true, 200, "andar_sequencia")).then().statusCode(400);
        como(admin).contentType(ContentType.JSON).body("{}").when().post("/condominio/previa").then().statusCode(400);
    }

    @Test
    @DisplayName("Só o administrador usa a prévia (403 para proprietário, 401 sem login)")
    void previaSoAdmin() {
        previa(proprietario, geometria(2, 2, false, 3, "andar_sequencia")).then().statusCode(403);
        semLogin().contentType(ContentType.JSON).body(geometria(2, 2, false, 3, "andar_sequencia")).when()
            .post("/condominio/previa").then().statusCode(401);
    }

    // ---------- Primeiro acesso ----------

    @Test
    @DisplayName("Com o condomínio já configurado, repetir o primeiro acesso retorna 409 e não altera a estrutura")
    void naoRepeteOPrimeiroAcesso() {
        int antes = estado(admin).get("total_de_unidades") instanceof Integer n ? n : -1;
        como(admin).contentType(ContentType.JSON).body(geometria(1, 1, false, 1, "andar_sequencia")).when()
            .post("/condominio").then().statusCode(409);
        como(admin).when().get("/condominio").then().body("total_de_unidades", equalTo(antes));
    }

    @Test
    @DisplayName("Só o administrador configura (403 para proprietário)")
    void primeiroAcessoSoAdmin() {
        como(proprietario).contentType(ContentType.JSON).body(geometria(1, 1, false, 1, "andar_sequencia")).when()
            .post("/condominio").then().statusCode(403);
    }

    // ---------- Nomes exibidos ----------

    @Test
    @DisplayName("Trocar os nomes muda as mensagens com a concordância de gênero e grava no histórico; a estrutura não muda")
    void trocaDeNomes() {
        int unidades = estado(admin).get("total_de_unidades") instanceof Integer n ? n : -1;
        Map<String, Object> novos = rotulosDe(originais);
        novos.put("agrupador_singular", "Torre");
        novos.put("agrupador_plural", "Torres");
        novos.put("agrupador_genero", "f");
        novos.put("agrupador_abrev", "To.");
        como(admin).contentType(ContentType.JSON).body(novos).when().put("/condominio/rotulos").then().statusCode(200)
            .body("agrupador_singular", equalTo("Torre"))
            .body("total_de_unidades", equalTo(unidades));

        como(admin).contentType(ContentType.JSON).body(Map.of("numero", "")).when().post("/blocos").then().statusCode(400)
            .body("error", equalTo("Número da torre é obrigatório."));

        como(admin).queryParam("entidade", "configuracao").queryParam("acao", "editar_rotulos").when()
            .get("/financeiro/auditoria").then().statusCode(200)
            .body("itens.acao", hasItem("editar_rotulos"));
    }

    @Test
    @DisplayName("Nomes inválidos retornam 400: gênero fora de m/f e nome com mais de 30 caracteres")
    void nomesInvalidos() {
        Map<String, Object> genero = rotulosDe(originais);
        genero.put("agrupador_genero", "x");
        como(admin).contentType(ContentType.JSON).body(genero).when().put("/condominio/rotulos").then().statusCode(400);

        Map<String, Object> longo = rotulosDe(originais);
        longo.put("unidade_singular", "x".repeat(31));
        como(admin).contentType(ContentType.JSON).body(longo).when().put("/condominio/rotulos").then().statusCode(400);
    }

    @Test
    @DisplayName("Só o administrador altera os nomes (403 para proprietário)")
    void nomesSoAdmin() {
        como(proprietario).contentType(ContentType.JSON).body(rotulosDe(originais)).when().put("/condominio/rotulos")
            .then().statusCode(403);
    }

    @Test
    @DisplayName("Plural e abreviação omitidos são deduzidos do singular")
    void deducaoDePluralEAbreviacao() {
        Map<String, Object> novos = new HashMap<>(rotulosDe(originais));
        novos.put("unidade_singular", "Sala");
        novos.put("unidade_plural", "");
        novos.put("unidade_abrev", "");
        como(admin).contentType(ContentType.JSON).body(novos).when().put("/condominio/rotulos").then().statusCode(200)
            .body("unidade_plural", equalTo("Salas"))
            .body("unidade_abrev", equalTo("Sa."));
    }
}
