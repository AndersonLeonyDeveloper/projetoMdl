package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Administradores (`/administradores`, `POST /auth/trocar-senha`) — seção 7.23 de sugestoes-de-testes.md e
 * regras-de-negocio.md, seção 5. Não há exclusão de contas: cada teste cria o próprio administrador (e-mail aleatório) e
 * a classe desativa todos no final. O administrador padrão nunca é desativado nem tem a senha alterada.
 */
class AdministradoresApiTest extends ApiBase {

    private static final String SENHA_INICIAL = "senha-inicial-1";
    private static String admin;
    private static int idDoAdminPadrao;
    private static final List<Integer> criados = new ArrayList<>();

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        List<Map<String, Object>> lista = como(admin).when().get("/administradores").then().statusCode(200)
            .extract().jsonPath().getList("$");
        idDoAdminPadrao = lista.stream().filter(a -> ADMIN.equals(a.get("email"))).map(a -> (int) a.get("id")).findFirst().orElseThrow();
    }

    @AfterAll
    static void desativarOsCriados() {
        for (int id : criados) {
            como(admin).contentType(ContentType.JSON).body(Map.of("ativo", false)).when().put("/administradores/" + id + "/ativo");
        }
    }

    private record Conta(int id, String email) {}

    private static String emailAleatorio() {
        return "teste." + ThreadLocalRandom.current().nextInt(100000, 999999) + "@exemplo.com";
    }

    private static Conta novoAdmin() {
        String email = emailAleatorio();
        int id = como(admin).contentType(ContentType.JSON).body(Map.of("email", email, "senha", SENHA_INICIAL))
            .when().post("/administradores").then().statusCode(201).extract().path("id");
        criados.add(id);
        return new Conta(id, email);
    }

    private static Response entrar(String email, String senha) {
        return semLogin().contentType(ContentType.JSON).body(Map.of("email", email, "senha", senha)).when().post("/auth/login");
    }

    // ---------- Lista e permissões ----------

    @Test
    @DisplayName("Lista os administradores marcando quem é você, sem expor senha nem hash")
    void lista() {
        como(admin).when().get("/administradores").then().statusCode(200)
            .body("email", hasItem(ADMIN))
            .body("find { it.email == '" + ADMIN + "' }.eu", equalTo(true))
            .body("find { it.email == '" + ADMIN + "' }.ativo", equalTo(true))
            .body("[0].senha_hash", equalTo(null));
    }

    @Test
    @DisplayName("Só o administrador acessa (403 para proprietário e inquilino, 401 sem login)")
    void permissoes() {
        for (String email : List.of(PROPRIETARIO, INQUILINO)) {
            String token = login(email);
            como(token).when().get("/administradores").then().statusCode(403);
            como(token).contentType(ContentType.JSON).body(Map.of("email", emailAleatorio(), "senha", SENHA_INICIAL))
                .when().post("/administradores").then().statusCode(403);
        }
        semLogin().when().get("/administradores").then().statusCode(401);
    }

    // ---------- Criar ----------

    @Test
    @DisplayName("Cria administrador (e-mail em minúsculas), recusa duplicado, e-mail inválido e senha curta, e o novo entra como admin")
    void cria() {
        String email = emailAleatorio();
        int id = como(admin).contentType(ContentType.JSON).body(Map.of("email", "  " + email.toUpperCase() + " ", "senha", SENHA_INICIAL))
            .when().post("/administradores").then().statusCode(201).body("email", equalTo(email)).extract().path("id");
        criados.add(id);

        como(admin).contentType(ContentType.JSON).body(Map.of("email", email, "senha", SENHA_INICIAL)).when().post("/administradores").then().statusCode(409);
        como(admin).contentType(ContentType.JSON).body(Map.of("email", PROPRIETARIO, "senha", SENHA_INICIAL)).when().post("/administradores").then().statusCode(409);
        como(admin).contentType(ContentType.JSON).body(Map.of("email", "sem-arroba", "senha", SENHA_INICIAL)).when().post("/administradores").then().statusCode(400);
        como(admin).contentType(ContentType.JSON).body(Map.of("email", emailAleatorio(), "senha", "abc")).when().post("/administradores").then().statusCode(400)
            .body("error", containsString("6 caracteres"));

        entrar(email, SENHA_INICIAL).then().statusCode(200).body("usuario.role", equalTo("admin"));
    }

    // ---------- Desativar e reativar ----------

    @Test
    @DisplayName("Desativar derruba o acesso na hora (token e login recusados); reativar devolve o acesso")
    void desativaEReativa() {
        Conta conta = novoAdmin();
        String token = entrar(conta.email(), SENHA_INICIAL).then().statusCode(200).extract().path("token");
        como(token).when().get("/administradores").then().statusCode(200);

        como(admin).contentType(ContentType.JSON).body(Map.of("ativo", false)).when().put("/administradores/" + conta.id() + "/ativo")
            .then().statusCode(200).body("ativo", equalTo(false));
        como(token).when().get("/administradores").then().statusCode(401);
        entrar(conta.email(), SENHA_INICIAL).then().statusCode(401);
        como(admin).when().get("/administradores").then().body("find { it.email == '" + conta.email() + "' }.ativo", equalTo(false));

        como(admin).contentType(ContentType.JSON).body(Map.of("ativo", true)).when().put("/administradores/" + conta.id() + "/ativo")
            .then().statusCode(200).body("ativo", equalTo(true));
        entrar(conta.email(), SENHA_INICIAL).then().statusCode(200);
    }

    @Test
    @DisplayName("Proteções: não desativa a própria conta (409), valor inválido 400, administrador inexistente ou que é morador 404")
    void protecoes() {
        como(admin).contentType(ContentType.JSON).body(Map.of("ativo", false)).when().put("/administradores/" + idDoAdminPadrao + "/ativo")
            .then().statusCode(409);
        como(admin).when().get("/administradores").then().body("find { it.email == '" + ADMIN + "' }.ativo", equalTo(true));

        Conta conta = novoAdmin();
        como(admin).contentType(ContentType.JSON).body(Map.of("ativo", "talvez")).when().put("/administradores/" + conta.id() + "/ativo").then().statusCode(400);
        como(admin).contentType(ContentType.JSON).body(Map.of("ativo", false)).when().put("/administradores/99999999/ativo").then().statusCode(404);

        int idDeMorador = entrar(PROPRIETARIO, SENHA).then().statusCode(200).extract().path("usuario.id");
        como(admin).contentType(ContentType.JSON).body(Map.of("ativo", false)).when().put("/administradores/" + idDeMorador + "/ativo").then().statusCode(404);
    }

    // ---------- Senhas ----------

    @Test
    @DisplayName("Redefine a senha de OUTRO administrador (a antiga cai, a nova vale); a própria senha e senha curta são recusadas")
    void redefineASenhaDeOutro() {
        Conta conta = novoAdmin();
        como(admin).contentType(ContentType.JSON).body(Map.of("nova_senha", "abc")).when().put("/administradores/" + conta.id() + "/senha").then().statusCode(400);
        como(admin).contentType(ContentType.JSON).body(Map.of("nova_senha", "nova-senha-9")).when().put("/administradores/" + idDoAdminPadrao + "/senha")
            .then().statusCode(400); // a própria senha se troca com a senha atual
        como(admin).contentType(ContentType.JSON).body(Map.of("nova_senha", "nova-senha-9")).when().put("/administradores/" + conta.id() + "/senha").then().statusCode(200);

        entrar(conta.email(), SENHA_INICIAL).then().statusCode(401);
        entrar(conta.email(), "nova-senha-9").then().statusCode(200);
    }

    @Test
    @DisplayName("Trocar a própria senha exige a senha atual, uma nova diferente e de 6+ caracteres; vale para qualquer perfil logado")
    void trocaAPropriaSenha() {
        Conta conta = novoAdmin();
        String token = entrar(conta.email(), SENHA_INICIAL).then().statusCode(200).extract().path("token");
        String corpo = "senha_atual";

        como(token).contentType(ContentType.JSON).body(Map.of(corpo, "errada", "nova_senha", "outra-senha-1")).when().post("/auth/trocar-senha").then().statusCode(400);
        como(token).contentType(ContentType.JSON).body(Map.of(corpo, SENHA_INICIAL, "nova_senha", "abc")).when().post("/auth/trocar-senha").then().statusCode(400);
        como(token).contentType(ContentType.JSON).body(Map.of(corpo, SENHA_INICIAL, "nova_senha", SENHA_INICIAL)).when().post("/auth/trocar-senha").then().statusCode(400);
        como(token).contentType(ContentType.JSON).body(Map.of(corpo, SENHA_INICIAL, "nova_senha", "outra-senha-1")).when().post("/auth/trocar-senha").then().statusCode(200);

        entrar(conta.email(), SENHA_INICIAL).then().statusCode(401);
        entrar(conta.email(), "outra-senha-1").then().statusCode(200);
        semLogin().contentType(ContentType.JSON).body(Map.of(corpo, "a", "nova_senha", "bbbbbbb")).when().post("/auth/trocar-senha").then().statusCode(401);
    }

    // ---------- Histórico ----------

    @Test
    @DisplayName("Tudo entra no Histórico de alterações (entidade usuário), sem nenhuma senha")
    void historico() {
        Conta conta = novoAdmin();
        como(admin).contentType(ContentType.JSON).body(Map.of("ativo", false)).when().put("/administradores/" + conta.id() + "/ativo").then().statusCode(200);
        como(admin).contentType(ContentType.JSON).body(Map.of("ativo", true)).when().put("/administradores/" + conta.id() + "/ativo").then().statusCode(200);
        como(admin).contentType(ContentType.JSON).body(Map.of("nova_senha", "senha-secreta-77")).when().put("/administradores/" + conta.id() + "/senha").then().statusCode(200);
        String token = entrar(conta.email(), "senha-secreta-77").then().extract().path("token");
        como(token).contentType(ContentType.JSON).body(Map.of("senha_atual", "senha-secreta-77", "nova_senha", "outra-secreta-88")).when().post("/auth/trocar-senha").then().statusCode(200);

        Response r = como(admin).queryParam("entidade", "usuario").queryParam("entidade_id", conta.id()).queryParam("limite", 50)
            .when().get("/financeiro/auditoria");
        r.then().statusCode(200)
            .body("itens.acao", hasItem("criar_admin"))
            .body("itens.acao", hasItem("desativar"))
            .body("itens.acao", hasItem("reativar"))
            .body("itens.acao", hasItem("redefinir_senha"))
            .body("itens.acao", hasItem("trocar_senha"))
            .body("itens.detalhe", hasItem(conta.email()));
        String bruto = r.asString();
        for (String segredo : List.of(SENHA_INICIAL, "senha-secreta-77", "outra-secreta-88")) {
            org.junit.jupiter.api.Assertions.assertFalse(bruto.contains(segredo), "senha no histórico: " + segredo);
        }
        r.then().body("itens.usuario_email", not(equalTo(null)));
    }
}
