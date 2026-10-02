package br.com.moradadalagoa.api;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Evolução do condomínio para moradores (`GET /financeiro/resumo/evolucao-publica`) — seção 7.13 de
 * sugestoes-de-testes.md e regras-de-negocio.md, seção 4.5. Só receitas e despesas por mês, sem nenhum dado de inadimplência.
 */
class EvolucaoPublicaApiTest extends ApiBase {

    private static String admin;
    private static String proprietario;
    private static String inquilino;

    @BeforeAll
    static void preparar() {
        admin = login(ADMIN);
        proprietario = login(PROPRIETARIO);
        inquilino = login(INQUILINO);
    }

    private static List<Map<String, Object>> publica(String token) {
        return como(token).queryParam("ano_inicio", 2020).queryParam("ano_fim", 2025)
            .when().get("/financeiro/resumo/evolucao-publica").then().statusCode(200).extract().jsonPath().getList("$");
    }

    @Test
    @DisplayName("Todos os perfis logados recebem; sem token, 401")
    void acesso() {
        for (String token : List.of(admin, proprietario, inquilino)) {
            org.junit.jupiter.api.Assertions.assertFalse(publica(token).isEmpty());
        }
        semLogin().queryParam("ano_inicio", 2020).queryParam("ano_fim", 2025)
            .when().get("/financeiro/resumo/evolucao-publica").then().statusCode(401);
    }

    @Test
    @DisplayName("Só traz ano, mês, receitas e despesas, e nenhum termo de inadimplência na resposta")
    void semInadimplencia() {
        for (Map<String, Object> linha : publica(proprietario)) {
            org.junit.jupiter.api.Assertions.assertEquals(java.util.Set.of("ano", "mes", "receitas", "despesas"), linha.keySet());
        }
        como(proprietario).queryParam("ano_inicio", 2020).queryParam("ano_fim", 2025)
            .when().get("/financeiro/resumo/evolucao-publica").then().statusCode(200)
            .body(not(containsString("atras"))).body(not(containsString("aberto")))
            .body(not(containsString("faturamento"))).body(not(containsString("unidades")))
            .body(not(containsString("inadimpl")));
    }

    @Test
    @DisplayName("Os valores batem com a evolução do admin (receitas = taxas pagas + outras receitas)")
    void valoresBatemComOAdmin() {
        List<Map<String, Object>> completa = como(admin).queryParam("ano_inicio", 2020).queryParam("ano_fim", 2025)
            .when().get("/financeiro/resumo/evolucao").then().statusCode(200).extract().jsonPath().getList("$");
        List<Map<String, Object>> publica = publica(proprietario);
        org.junit.jupiter.api.Assertions.assertEquals(completa.size(), publica.size());
        for (int i = 0; i < completa.size(); i++) {
            Map<String, Object> a = completa.get(i);
            Map<String, Object> p = publica.get(i);
            org.junit.jupiter.api.Assertions.assertEquals(a.get("ano"), p.get("ano"));
            org.junit.jupiter.api.Assertions.assertEquals(a.get("mes"), p.get("mes"));
            double receitasAdmin = ((Number) a.get("receitas_taxas")).doubleValue() + ((Number) a.get("receitas_outras")).doubleValue();
            org.junit.jupiter.api.Assertions.assertEquals(receitasAdmin, ((Number) p.get("receitas")).doubleValue(), 0.01);
            org.junit.jupiter.api.Assertions.assertEquals(((Number) a.get("despesas")).doubleValue(), ((Number) p.get("despesas")).doubleValue(), 0.01);
        }
    }

    @Test
    @DisplayName("Período inválido ou ausente retorna 400")
    void periodoInvalido() {
        como(proprietario).queryParam("ano_inicio", 2026).queryParam("ano_fim", 2020)
            .when().get("/financeiro/resumo/evolucao-publica").then().statusCode(400);
        como(proprietario).when().get("/financeiro/resumo/evolucao-publica").then().statusCode(400);
    }

    @Test
    @DisplayName("A evolução completa continua restrita ao admin")
    void completaContinuaDoAdmin() {
        como(proprietario).queryParam("ano_inicio", 2020).queryParam("ano_fim", 2025)
            .when().get("/financeiro/resumo/evolucao").then().statusCode(403);
        como(inquilino).queryParam("ano_inicio", 2020).queryParam("ano_fim", 2025)
            .when().get("/financeiro/resumo/evolucao").then().statusCode(403);
    }
}
