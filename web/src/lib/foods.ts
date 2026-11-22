import type { LogItem, Totals } from './types';

export interface Food {
  id: string;
  name: string;
  group: 'Proteínas' | 'Carboidratos' | 'Frutas' | 'Gorduras' | 'Vegetais' | 'Laticínios';
  /** Valores por 100 g (ou 100 ml). */
  per100: Totals;
  unit?: { label: string; grams: number };
  source: 'TACO' | 'USDA' | 'Rótulo típico';
}

/**
 * Tabela de alimentos. Valores da Tabela TACO (Unicamp) ou da USDA FoodData Central;
 * o whey usa um rótulo típico de whey concentrado — confira o seu rótulo.
 */
export const FOODS: Food[] = [
  { id: 'ovo', name: 'Ovo inteiro cozido', group: 'Proteínas', per100: { kcal: 146, p: 13.3, c: 0.6, f: 9.5 }, unit: { label: 'ovo', grams: 50 }, source: 'TACO' },
  { id: 'clara', name: 'Clara de ovo', group: 'Proteínas', per100: { kcal: 52, p: 10.9, c: 0.7, f: 0.2 }, unit: { label: 'clara', grams: 30 }, source: 'USDA' },
  { id: 'frango', name: 'Peito de frango grelhado', group: 'Proteínas', per100: { kcal: 159, p: 32.0, c: 0, f: 2.5 }, source: 'TACO' },
  { id: 'patinho', name: 'Patinho grelhado', group: 'Proteínas', per100: { kcal: 219, p: 35.9, c: 0, f: 7.3 }, source: 'TACO' },
  { id: 'tilapia', name: 'Tilápia grelhada', group: 'Proteínas', per100: { kcal: 128, p: 26.2, c: 0, f: 2.7 }, source: 'USDA' },
  { id: 'atum', name: 'Atum em água (drenado)', group: 'Proteínas', per100: { kcal: 116, p: 25.5, c: 0, f: 0.8 }, source: 'USDA' },
  { id: 'sardinha', name: 'Sardinha em óleo (drenada)', group: 'Proteínas', per100: { kcal: 208, p: 24.6, c: 0, f: 11.5 }, source: 'USDA' },
  { id: 'whey', name: 'Whey protein concentrado', group: 'Proteínas', per100: { kcal: 400, p: 80, c: 8, f: 5 }, unit: { label: 'scoop', grams: 30 }, source: 'Rótulo típico' },
  { id: 'iogurte', name: 'Iogurte natural desnatado', group: 'Laticínios', per100: { kcal: 41, p: 3.8, c: 5.8, f: 0.3 }, unit: { label: 'pote', grams: 170 }, source: 'TACO' },
  { id: 'queijo_minas', name: 'Queijo minas frescal', group: 'Laticínios', per100: { kcal: 264, p: 17.4, c: 3.2, f: 20.2 }, unit: { label: 'fatia', grams: 30 }, source: 'TACO' },
  { id: 'leite_desnatado', name: 'Leite desnatado', group: 'Laticínios', per100: { kcal: 34, p: 3.4, c: 5.0, f: 0.1 }, unit: { label: 'copo 200 ml', grams: 200 }, source: 'USDA' },
  { id: 'arroz', name: 'Arroz branco cozido', group: 'Carboidratos', per100: { kcal: 128, p: 2.5, c: 28.1, f: 0.2 }, source: 'TACO' },
  { id: 'feijao', name: 'Feijão carioca cozido', group: 'Carboidratos', per100: { kcal: 76, p: 4.8, c: 13.6, f: 0.5 }, source: 'TACO' },
  { id: 'batata', name: 'Batata inglesa cozida', group: 'Carboidratos', per100: { kcal: 52, p: 1.2, c: 11.9, f: 0 }, source: 'TACO' },
  { id: 'batata_doce', name: 'Batata-doce cozida', group: 'Carboidratos', per100: { kcal: 77, p: 0.6, c: 18.4, f: 0.1 }, source: 'TACO' },
  { id: 'mandioca', name: 'Mandioca cozida', group: 'Carboidratos', per100: { kcal: 125, p: 0.6, c: 30.1, f: 0.3 }, source: 'TACO' },
  { id: 'cuscuz', name: 'Cuscuz de milho cozido', group: 'Carboidratos', per100: { kcal: 113, p: 2.2, c: 25.3, f: 0.7 }, source: 'TACO' },
  { id: 'aveia', name: 'Aveia em flocos', group: 'Carboidratos', per100: { kcal: 394, p: 13.9, c: 66.6, f: 8.5 }, unit: { label: 'colher de sopa', grams: 15 }, source: 'TACO' },
  { id: 'pao_frances', name: 'Pão francês', group: 'Carboidratos', per100: { kcal: 300, p: 8.0, c: 58.6, f: 3.1 }, unit: { label: 'unidade', grams: 50 }, source: 'TACO' },
  { id: 'macarrao', name: 'Macarrão cozido', group: 'Carboidratos', per100: { kcal: 158, p: 5.8, c: 30.9, f: 0.9 }, source: 'USDA' },
  { id: 'banana', name: 'Banana prata', group: 'Frutas', per100: { kcal: 98, p: 1.3, c: 26.0, f: 0.1 }, unit: { label: 'unidade média', grams: 100 }, source: 'TACO' },
  { id: 'mamao', name: 'Mamão papaya', group: 'Frutas', per100: { kcal: 40, p: 0.5, c: 10.4, f: 0.1 }, source: 'TACO' },
  { id: 'maca', name: 'Maçã', group: 'Frutas', per100: { kcal: 56, p: 0.3, c: 15.2, f: 0 }, unit: { label: 'unidade média', grams: 130 }, source: 'TACO' },
  { id: 'laranja', name: 'Laranja pera', group: 'Frutas', per100: { kcal: 37, p: 1.0, c: 8.9, f: 0.1 }, source: 'TACO' },
  { id: 'morango', name: 'Morango', group: 'Frutas', per100: { kcal: 30, p: 0.9, c: 6.8, f: 0.3 }, source: 'TACO' },
  { id: 'melancia', name: 'Melancia', group: 'Frutas', per100: { kcal: 33, p: 0.9, c: 8.1, f: 0 }, source: 'TACO' },
  { id: 'abacate', name: 'Abacate', group: 'Frutas', per100: { kcal: 96, p: 1.2, c: 6.0, f: 8.4 }, source: 'TACO' },
  { id: 'azeite', name: 'Azeite de oliva', group: 'Gorduras', per100: { kcal: 884, p: 0, c: 0, f: 100 }, unit: { label: 'colher de sopa', grams: 13 }, source: 'USDA' },
  { id: 'pasta_amendoim', name: 'Pasta de amendoim integral', group: 'Gorduras', per100: { kcal: 588, p: 25, c: 20, f: 50 }, unit: { label: 'colher de sopa', grams: 15 }, source: 'USDA' },
  { id: 'manteiga', name: 'Manteiga', group: 'Gorduras', per100: { kcal: 717, p: 0.9, c: 0.1, f: 81 }, unit: { label: 'colher de chá', grams: 5 }, source: 'USDA' },
  { id: 'salada', name: 'Salada de folhas e tomate', group: 'Vegetais', per100: { kcal: 16, p: 1.0, c: 3.0, f: 0.2 }, source: 'TACO' },
  { id: 'legumes', name: 'Legumes cozidos (brócolis, abobrinha, cenoura)', group: 'Vegetais', per100: { kcal: 30, p: 1.6, c: 5.5, f: 0.3 }, source: 'TACO' },
];

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

export interface Preset {
  id: string;
  name: string;
  portion: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  category: 'Lanches e besteiras' | 'Refeições' | 'Doces' | 'Bebidas';
}

/**
 * Porções típicas, valores APROXIMADOS (variam muito por receita e tamanho).
 * Se souber o rótulo ou o tamanho real, ajuste as calorias antes de salvar.
 */
export const PRESETS: Preset[] = [
  { id: 'pizza_mussarela', name: 'Pizza de muçarela', portion: '1 fatia (~110 g)', kcal: 290, p: 13, c: 36, f: 11, category: 'Lanches e besteiras' },
  { id: 'pizza_calabresa', name: 'Pizza de calabresa', portion: '1 fatia (~110 g)', kcal: 320, p: 13, c: 34, f: 15, category: 'Lanches e besteiras' },
  { id: 'hamburguer', name: 'Hambúrguer de lanchonete', portion: '1 sanduíche', kcal: 560, p: 30, c: 45, f: 28, category: 'Lanches e besteiras' },
  { id: 'batata_frita', name: 'Batata frita', portion: 'porção média (~110 g)', kcal: 340, p: 4, c: 44, f: 17, category: 'Lanches e besteiras' },
  { id: 'cachorro_quente', name: 'Cachorro-quente completo', portion: '1 unidade', kcal: 450, p: 15, c: 45, f: 23, category: 'Lanches e besteiras' },
  { id: 'coxinha', name: 'Coxinha de frango', portion: '1 média (~100 g)', kcal: 283, p: 10, c: 35, f: 12, category: 'Lanches e besteiras' },
  { id: 'pastel', name: 'Pastel de carne frito', portion: '1 médio (~80 g)', kcal: 310, p: 8, c: 35, f: 16, category: 'Lanches e besteiras' },
  { id: 'pao_queijo', name: 'Pão de queijo', portion: '1 unidade (~40 g)', kcal: 145, p: 2, c: 14, f: 10, category: 'Lanches e besteiras' },
  { id: 'chips', name: 'Batata chips', portion: '1 pacote (~45 g)', kcal: 241, p: 3, c: 24, f: 15, category: 'Lanches e besteiras' },
  { id: 'picanha', name: 'Picanha grelhada', portion: '150 g', kcal: 434, p: 40, c: 0, f: 29, category: 'Refeições' },
  { id: 'linguica', name: 'Linguiça grelhada', portion: '1 gomo (~70 g)', kcal: 207, p: 16, c: 0, f: 15, category: 'Refeições' },
  { id: 'farofa', name: 'Farofa pronta', portion: '2 colheres de sopa (~30 g)', kcal: 120, p: 1, c: 24, f: 2, category: 'Refeições' },
  { id: 'feijoada', name: 'Feijoada', portion: '1 concha cheia (~250 g)', kcal: 293, p: 22, c: 29, f: 16, category: 'Refeições' },
  { id: 'lasanha', name: 'Lasanha à bolonhesa', portion: '1 porção (~300 g)', kcal: 480, p: 25, c: 45, f: 22, category: 'Refeições' },
  { id: 'brigadeiro', name: 'Brigadeiro', portion: '1 unidade (~20 g)', kcal: 80, p: 1, c: 13, f: 3, category: 'Doces' },
  { id: 'chocolate', name: 'Chocolate ao leite', portion: '25 g', kcal: 134, p: 2, c: 15, f: 7.5, category: 'Doces' },
  { id: 'sorvete', name: 'Sorvete de massa', portion: '1 bola (~70 g)', kcal: 145, p: 2.5, c: 17, f: 7.7, category: 'Doces' },
  { id: 'bolo', name: 'Bolo caseiro', portion: '1 fatia (~60 g)', kcal: 230, p: 3, c: 33, f: 9, category: 'Doces' },
  { id: 'biscoito_recheado', name: 'Biscoito recheado', portion: '3 unidades (~30 g)', kcal: 142, p: 2, c: 21, f: 6, category: 'Doces' },
  { id: 'acai', name: 'Açaí com granola e banana', portion: '300 ml', kcal: 450, p: 5, c: 75, f: 15, category: 'Doces' },
  { id: 'refri', name: 'Refrigerante comum', portion: '1 lata (350 ml)', kcal: 149, p: 0, c: 37, f: 0, category: 'Bebidas' },
  { id: 'cerveja', name: 'Cerveja pilsen', portion: '1 lata (350 ml)', kcal: 150, p: 1.6, c: 12, f: 0, category: 'Bebidas' },
  { id: 'vinho', name: 'Vinho tinto', portion: '1 taça (150 ml)', kcal: 128, p: 0, c: 4, f: 0, category: 'Bebidas' },
  { id: 'caipirinha', name: 'Caipirinha', portion: '1 copo', kcal: 240, p: 0, c: 30, f: 0, category: 'Bebidas' },
  { id: 'destilado', name: 'Destilado com refrigerante', portion: '1 dose + 200 ml', kcal: 200, p: 0, c: 21, f: 0, category: 'Bebidas' },
];

export const PRESET_BY_ID: Record<string, Preset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function foodTotals(food: Food, grams: number): Totals {
  const k = grams / 100;
  return {
    kcal: food.per100.kcal * k,
    p: food.per100.p * k,
    c: food.per100.c * k,
    f: food.per100.f * k,
  };
}

export function foodItem(food: Food, grams: number): LogItem {
  const t = foodTotals(food, grams);
  return { name: food.name, grams, kcal: round1(t.kcal), p: round1(t.p), c: round1(t.c), f: round1(t.f) };
}

export function presetItem(preset: Preset, qty: number): LogItem {
  return {
    name: `${preset.name} · ${preset.portion}`,
    qty,
    kcal: round1(preset.kcal * qty),
    p: round1(preset.p * qty),
    c: round1(preset.c * qty),
    f: round1(preset.f * qty),
  };
}

export function sumItems(items: LogItem[]): Totals {
  return items.reduce(
    (acc, it) => ({ kcal: acc.kcal + it.kcal, p: acc.p + it.p, c: acc.c + it.c, f: acc.f + it.f }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
