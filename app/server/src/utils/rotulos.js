import { lerCondominio } from '../db/estrutura.js';

// Nomes exibidos para agrupador (bloco, torre...) e unidade (apartamento, casa...), com as concordâncias de gênero
// usadas nas mensagens do servidor. As chaves técnicas da API (bloco_id, /blocos...) não mudam.
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function termo(singular, plural, genero, abrev) {
  const f = genero === 'f';
  const min = singular.toLowerCase();
  return {
    singular, plural, abrev, min, pluralMin: plural.toLowerCase(), Min: maiuscula(min), // Min: "Bloco" com inicial maiúscula
    o: f ? 'a' : 'o', do: f ? 'da' : 'do', no: f ? 'na' : 'no', um: f ? 'uma' : 'um',
    deste: f ? 'desta' : 'deste',
    este: f ? 'esta' : 'este', esse: f ? 'essa' : 'esse', nesse: f ? 'nessa' : 'nesse',
    encontrado: f ? 'encontrada' : 'encontrado',
  };
}

export function rotulos() {
  const c = lerCondominio();
  return {
    nome: c.nome,
    agrupador: termo(c.agrupador_singular, c.agrupador_plural, c.agrupador_genero, c.agrupador_abrev),
    unidade: termo(c.unidade_singular, c.unidade_plural, c.unidade_genero, c.unidade_abrev),
    maiuscula,
  };
}
