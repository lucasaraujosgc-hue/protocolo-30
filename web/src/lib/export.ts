import { addDays, diffDays, fmtShort, rangeDates, weekday, weekdayLong } from './dates';
import {
  adaptiveTdee,
  bankSummary,
  calibrationSamples,
  composition,
  emaTrend,
  evalDay,
  exerciseTargets,
  fastingWeights,
  intervalCriteria,
  latestValues,
  linearSlope,
  review,
  seriesOf,
  sortedMeasurements,
  weeklyAverages,
  type DayEval,
} from './engine';
import { FOODS } from './foods';
import { diffProtocols, EXPORT_TYPE, FILE_TYPE, sortProtocols, toProtocolFile } from './protocol';
import type { AppState, DayLog, ExerciseLog, MealLog, Measurement, Protocol } from './types';
import { TARGET_KEYS } from './types';

const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);

const REGISTRO: Record<MealLog['status'], string> = {
  planned: 'seguiu',
  more: 'a_mais',
  less: 'a_menos',
  skipped: 'pulou',
  swapped: 'trocou',
};

const SITUACAO: Record<ExerciseLog['status'], string> = { done: 'feito', partial: 'parcial', missed: 'nao_fez' };

const ORIGEM: Record<Protocol['source'], string> = {
  padrao: 'plano inicial do app',
  migracao: 'plano inicial (migrado da versão anterior do app)',
  ajustes: 'editado em Ajustes',
  arquivo: 'arquivo importado (IA)',
};

/** Remove chaves undefined/null para o arquivo ficar enxuto. */
function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === null) delete o[k];
  return o;
}

function promptText(state: AppState, today: string): string {
  const nome = state.profile?.name ? state.profile.name : 'o usuário';
  return [
    `Você vai analisar a evolução de ${nome} no app "Protocolo 30" (dieta + spinning + musculação, com banco de calorias). Este arquivo é uma exportação completa, gerada em ${fmtShort(today)}: perfil, resumo, protocolo atual, histórico de versões do protocolo, todos os dias registrados, medidas corporais e compensações.`,
    '',
    'COMO ANALISAR',
    '1. Leia "comoLer" para entender os campos e as regras do banco de calorias.',
    '2. Avalie: peso em jejum (use médias semanais e tendência, não pesagens isoladas; a semana 1 costuma vir inflada por água e glicogênio), cintura e demais medidas, ritmo de perda em kg/semana e em % do peso, aderência ao cardápio, treinos feitos x planejados (calorias ativas, FC média, RPE), passos, saldo do banco e compensações.',
    '3. Seja crítico e honesto. Não invente dados: se algo não foi registrado, diga que falta. Separe fato (registrado) de estimativa (composição corporal por fórmula, calorias do relógio, gasto adaptativo).',
    '4. Segurança: nada de dietas extremas, jejum prolongado, desidratação, laxantes, diuréticos ou HIIT diário. Proteína de pelo menos 1,6 g/kg; não descer de ~1.900–2.000 kcal sem acompanhamento profissional (ele treina duas vezes por dia). Ritmo de perda saudável: 0,5–1% do peso por semana. A musculação é prescrita pelo personal dele: não troque exercícios, só a energia e a recuperação em volta dela.',
    '5. Responda com: (a) resumo da evolução com números; (b) o que está funcionando; (c) problemas e riscos; (d) ajustes recomendados, com o porquê de cada um.',
    '',
    'SE RECOMENDAR MUDANÇAS NO PROTOCOLO',
    `Entregue também um bloco de código JSON no formato "${FILE_TYPE}" (modelo em "formatoDeAtualizacao"). Ele importa esse arquivo em Ajustes → "Atualizar protocolo" e o app cria uma nova versão a partir da data "aPartirDe"; os dias anteriores continuam calculados com a versão antiga.`,
    '- Parta de "protocoloAtual" (já está nesse formato): copie e altere só o necessário.',
    '- Pode mandar só as seções que mudaram dentro de "protocolo" (targets, meals, foods, training, bank, reductionLadder, substitutions); as que faltarem continuam iguais. Se mandar "meals", mande o cardápio inteiro.',
    `- "aPartirDe" normalmente é o dia seguinte (hoje é ${today}).`,
    '- A soma do cardápio deve bater com targets.kcal (±50 kcal) e os macros com p/c/f. Use os ids de "alimentosDisponiveis" com gramas do alimento pronto/cozido; para um alimento novo, inclua-o em "foods" com valores por 100 g.',
    '- Se não houver motivo para mudar o protocolo, diga isso e não gere o JSON.',
  ].join('\n');
}

const COMO_LER: Record<string, string> = {
  datas: 'Datas no formato AAAA-MM-DD, no fuso do celular. "dia" é o dia do protocolo (1 = início).',
  'dias[].consumo': 'Total do dia. Refeição já passada e sem registro conta como seguida (exatamente o cardápio).',
  'dias[].refeicoes[].registro':
    'seguiu = comeu o cardápio; seguiu_com_corte = comeu o cardápio já com os cortes do dia (compensação ou meta abaixo do cardápio); a_mais = cardápio + itens extras; a_menos = fração do prato (fracaoComida); pulou = 0 kcal; trocou = comeu outra coisa (itens); sem_registro = passou do horário sem registro (conta como seguida); ainda_nao = horário ainda não chegou.',
  'dias[].treinos':
    'planejado = sessão prevista pelo protocolo; extra = treino fora da agenda. kcalAtivas vêm do Apple Watch. metaKcalAtivas é o gasto esperado da sessão (calibrada pela mediana das 3 primeiras sessões do tipo, quando "calibrada" = true).',
  'dias[].banco':
    'Saldo do dia em kcal: positivo = à frente do plano (crédito), negativo = atrás (débito). comida = meta − consumo; treino = (kcalAtivas − meta) por sessão, treino não feito = −meta, créditos multiplicados pelo fatorCredito; passos = (passos − meta) × kcal por passo (créditos × fatorCredito; hoje, falta de passos ainda não conta); absorvido = débito aceito como atraso, sem compensar. acumulado = soma desde o dia 1.',
  'resumo.peso': 'Pesagens em jejum. ritmoKgPorSemana14d = inclinação da reta dos últimos 14 dias (negativo = perdendo peso). tendenciaKg = média móvel exponencial.',
  registradoEm: 'Momento do registro no app, em UTC (ISO 8601).',
  'resumo.composicao': 'Estimativas por fórmula (RFM pela cintura e Marinha dos EUA pela cintura e pescoço). Não são exames; use como tendência.',
  'resumo.gastoAdaptativo': 'Gasto diário estimado pela balança: ingestão média − variação de peso × 7.700 kcal/kg, ignorando a semana 1. Só aparece com dados suficientes.',
  protocolo: '"protocoloAtual" é a versão em vigor hoje, no mesmo formato aceito na importação. "historicoDeProtocolos" lista todas as versões e o que mudou em cada uma; cada dia informa a versão usada ("protocolo").',
};

function formatoDeAtualizacao(today: string) {
  return {
    tipo: FILE_TYPE,
    versao: 1,
    nome: 'Nome curto da nova versão',
    aPartirDe: addDays(today, 1),
    observacoes: 'O que mudou e por quê (aparece para ele antes de aplicar).',
    protocolo: {
      targets: { kcal: 2250, p: 197, c: 240, f: 56, steps: 10000 },
      meals: [
        {
          id: 'cafe',
          name: 'Café da manhã',
          short: 'Café',
          time: '06:15',
          hint: 'Texto curto',
          items: [
            { food: 'ovo', grams: 150, label: 'Ovos inteiros (3 un.)' },
            { label: 'Item fora da tabela', kcal: 120, p: 10, c: 12, f: 3 },
            { free: 'Café sem açúcar' },
          ],
        },
      ],
      foods: [{ id: 'novo_alimento', name: 'Nome do alimento', group: 'Proteínas', per100: { kcal: 0, p: 0, c: 0, f: 0 } }],
      training: {
        spinDays: [2, 3, 5, 6],
        liftDays: [1, 2, 3, 4, 5],
        legDays: [1, 4],
        hardDay: 3,
        spinTime: '05:30',
        liftTime: '17:00',
        intervalsFrom: null,
        exerciseTargets: { z2: 250, tempo: 280, intervalado: 300, livre: 250, musculacao: 280, outro: 200 },
        sessions: { z2: { name: 'Z2 30', zone: 'Zona 2', hr: '110–130 bpm', rpe: 'RPE 3–4', blocks: ['Aquecimento · 5 min', 'Treino · 22 min', 'Desaquecimento · 3 min'] } },
      },
      bank: { creditFactor: 0.75, maxFoodCut: 300, foodFloor: 1950, maxExtraActive: 300, autoCalibrate: true },
    },
    regras: {
      diasDaSemana: '0 = domingo, 1 = segunda … 6 = sábado.',
      hardDay: 'Dia da sessão forte de spinning (Tempo; vira Intervalado a partir de training.intervalsFrom).',
      exerciseTargets: 'Calorias ATIVAS esperadas por sessão, em kcal.',
      items: 'Use { food, grams } com ids da tabela; { label, kcal, p, c, f } para itens com valores próprios; { free } para itens sem calorias.',
      meals: 'ids em minúsculas, sem espaço (mantenha os existentes quando a refeição continuar a mesma); time em HH:MM; até 12 refeições.',
      bank: 'creditFactor 0,3–1; maxFoodCut 0–800; foodFloor 1.200–4.000; maxExtraActive 0–1.200.',
      reductionLadder: 'Opcional. Ordem dos cortes quando é preciso comer menos: [{ meal, food, from, to }] em gramas.',
    },
  };
}

function exportMeal(ev: DayEval, i: number) {
  const m = ev.meals[i];
  const log = m.log;
  let registro: string;
  if (log) {
    registro = REGISTRO[log.status];
    if (log.status === 'planned' && Math.round(m.planned.kcal) - log.kcal > 1) registro = 'seguiu_com_corte';
  } else registro = m.passed ? 'sem_registro' : 'ainda_nao';
  return compact({
    id: m.meal.id,
    nome: m.meal.name,
    horario: m.meal.time,
    registro,
    kcal: r0(m.actual.kcal),
    p: r1(m.actual.p),
    c: r1(m.actual.c),
    f: r1(m.actual.f),
    planejadoKcal: r0(m.planned.kcal),
    itens: log?.items?.length
      ? log.items.map((it) => compact({ nome: it.name, gramas: it.grams, qtd: it.qty, kcal: r0(it.kcal), p: r1(it.p), c: r1(it.c), f: r1(it.f) }))
      : undefined,
    fracaoComida: log?.status === 'less' ? log.fraction : undefined,
    obs: log?.note,
    registradoEm: log?.at,
  });
}

function exportExercise(log: ExerciseLog | undefined, extra: Record<string, unknown>) {
  return compact({
    ...extra,
    tipo: log?.kind,
    modelo: log?.template,
    situacao: log ? SITUACAO[log.status] : 'sem_registro',
    minutos: log?.minutes,
    kcalAtivas: log?.activeKcal,
    kcalTotais: log?.totalKcal,
    fcMedia: log?.avgHr,
    rpe: log?.rpe,
    obs: log?.note,
    registradoEm: log?.at,
  });
}

function exportDay(day: DayEval, cumulative: number | null, raw: DayLog | undefined) {
  return compact({
    data: day.date,
    diaSemana: weekdayLong(weekday(day.date)),
    dia: day.dayNumber,
    antesDoInicio: day.dayNumber < 1 ? true : undefined,
    situacao: day.isToday ? 'hoje (parcial)' : 'fechado',
    protocolo: day.protocol.id,
    meta: { kcal: day.target.kcal, p: day.target.p, c: day.target.c, f: day.target.f, passos: day.target.steps },
    cardapioKcal: day.plan.kcal,
    consumo: { kcal: r0(day.actual.kcal), p: r1(day.actual.p), c: r1(day.actual.c), f: r1(day.actual.f) },
    refeicoes: day.meals.map((_, i) => exportMeal(day, i)),
    foraDoPlano: raw?.extras.length
      ? raw.extras.map((x) => compact({ nome: x.name, qtd: x.qty, gramas: x.grams, kcal: r0(x.kcal), p: r1(x.p), c: r1(x.c), f: r1(x.f), registradoEm: x.at }))
      : undefined,
    registrosForaDoCardapio: day.orphanMeals.length
      ? day.orphanMeals.map((o) => ({ id: o.id, registro: REGISTRO[o.log.status], kcal: r0(o.log.kcal), p: r1(o.log.p), c: r1(o.log.c), f: r1(o.log.f) }))
      : undefined,
    treinos: [
      ...day.sessions.map((s) =>
        exportExercise(s.log, {
          planejado: s.planned.label,
          horario: s.planned.time,
          metaKcalAtivas: r0(s.target),
          desvioKcal: s.state === 'pending' ? undefined : r0(s.dev),
        }),
      ),
      ...day.extraSessions.map((x) => exportExercise(x.log, { planejado: 'extra (fora da agenda)' })),
    ],
    passos: day.steps ?? null,
    metaPassos: day.stepsTarget,
    banco:
      day.dayNumber >= 1
        ? {
            comida: r0(day.foodDev),
            treino: r0(day.exDevAdj),
            passos: r0(day.stepsDevAdj),
            absorvido: r0(day.absorbed),
            saldoDoDia: r0(day.balance),
            acumulado: cumulative === null ? undefined : r0(cumulative),
          }
        : undefined,
  });
}

function exportMeasurement(m: Measurement) {
  return compact({
    data: m.date,
    hora: m.time,
    jejum: m.fasting,
    pesoKg: m.weight,
    cinturaUmbigoCm: m.waistNavel,
    cinturaEstreitaCm: m.waistNarrow,
    pescocoCm: m.neck,
    peitoCm: m.chest,
    quadrilCm: m.hip,
    bracoRelaxadoCm: m.armRelaxed,
    bracoContraidoCm: m.armFlexed,
    coxaCm: m.thigh,
    panturrilhaCm: m.calf,
    fcRepouso: m.restingHr,
    pressao: m.bpSys && m.bpDia ? `${m.bpSys}/${m.bpDia}` : undefined,
    obs: m.note,
  });
}

function trainingSummary(p: Protocol) {
  const t = p.training;
  const names = (d: number[]) => d.map((x) => weekdayLong(x)).join(', ') || 'nenhum';
  return {
    spinning: `${names(t.spinDays)} às ${t.spinTime}`,
    musculacao: `${names(t.liftDays)} às ${t.liftTime} (pernas: ${names(t.legDays)})`,
    sessaoForte: weekdayLong(t.hardDay),
    intervaladoLiberadoEm: t.intervalsFrom,
  };
}

export interface ExportResult {
  json: string;
  fileName: string;
  days: number;
  bytes: number;
}

/** Monta a exportação completa para análise por IA (síncrono: pode ser usado dentro do toque do botão). */
export function buildAiExport(state: AppState, today: string, nowMin: number): ExportResult {
  const samples = calibrationSamples(state);
  const opts = { today, nowMin, samples };
  const bank = bankSummary(state, opts);
  const start = state.settings.startDate;
  const versions = sortProtocols(state.protocols);
  const current = versions.reduce((acc, v) => (v.from <= today ? v : acc), versions[0]);

  // Dias: do início até hoje; dias antes do início só entram se tiverem registro.
  const rows = new Map(bank.rows.map((r) => [r.date, r]));
  const logged = Object.keys(state.days).filter((d) => d <= today).sort();
  const pre = logged.filter((d) => d < start);
  const range = today >= start ? rangeDates(start, today) : [];
  const dates = [...pre, ...range];
  const dias = dates.map((d) => {
    const row = rows.get(d);
    const ev = d === today ? bank.today : row?.ev ?? evalDay(state, d, opts);
    const c = d < start ? null : d === today ? bank.projected : row?.cumulative ?? null;
    return exportDay(ev, c, state.days[d]);
  });

  // Resumo
  const ms = sortedMeasurements(state.measurements);
  const weights = fastingWeights(ms);
  const trend = emaTrend(weights);
  const recent = weights.filter((p) => diffDays(today, p.date) <= 14);
  const slope = recent.length >= 4 ? linearSlope(recent.map((p) => ({ x: diffDays(p.date, today), y: p.value }))) : null;
  const waist = seriesOf(ms, 'waistNavel');
  const lv = latestValues(ms);
  const compo = composition(lv, state.profile);
  const rev = review(state, opts, bank);
  const tdee = adaptiveTdee(state, opts, bank);
  const closed = bank.rows.filter((r) => r.ev.dayNumber >= 1);
  const onTarget = closed.filter((r) => Math.abs(r.ev.foodDev) <= 100).length;
  let planned = 0;
  let done = 0;
  let mealsDue = 0;
  let mealsLogged = 0;
  const stepVals: number[] = [];
  for (const r of closed) {
    planned += r.ev.sessions.length;
    done += r.ev.sessions.filter((s) => s.state === 'done' || s.state === 'partial').length;
    mealsDue += r.ev.meals.length;
    mealsLogged += r.ev.meals.filter((m) => m.log).length;
    if (r.ev.steps !== undefined) stepVals.push(r.ev.steps);
  }
  const tg = exerciseTargets(current, samples);
  const crit = intervalCriteria(state);
  const dayNumber = diffDays(today, start) + 1;

  const resumo = compact({
    dataInicio: start,
    diaAtual: dayNumber,
    semanaAtual: dayNumber >= 1 ? Math.ceil(dayNumber / 7) : 0,
    peso: compact({
      inicial: weights[0] ? { data: weights[0].date, kg: weights[0].value } : undefined,
      atual: weights.length ? { data: weights[weights.length - 1].date, kg: weights[weights.length - 1].value } : undefined,
      variacaoKg: weights.length >= 2 ? r1(weights[weights.length - 1].value - weights[0].value) : undefined,
      tendenciaKg: trend.length ? r1(trend[trend.length - 1].value) : undefined,
      ritmoKgPorSemana14d: slope !== null ? r1(slope * 7) : undefined,
      pesagensEmJejum: weights.length,
      mediasSemanais: weeklyAverages(state, today).map((w) => compact({ semana: w.week, de: w.from, ate: w.to, mediaKg: w.avg === null ? undefined : r1(w.avg), pesagens: w.n })),
    }),
    cinturaUmbigo: waist.length
      ? compact({
          inicial: { data: waist[0].date, cm: waist[0].value },
          atual: { data: waist[waist.length - 1].date, cm: waist[waist.length - 1].value },
          variacaoCm: waist.length >= 2 ? r1(waist[waist.length - 1].value - waist[0].value) : undefined,
        })
      : undefined,
    composicao: compo.bmi
      ? compact({
          imc: r1(compo.bmi),
          cinturaAltura: compo.whtr !== undefined ? Math.round(compo.whtr * 1000) / 1000 : undefined,
          gorduraRfmPct: compo.rfm !== undefined ? r1(compo.rfm) : undefined,
          gorduraMarinhaPct: compo.navy !== undefined ? r1(compo.navy) : undefined,
          massaGordaKg: compo.fatMass !== undefined ? r1(compo.fatMass) : undefined,
          massaMagraKg: compo.leanMass !== undefined ? r1(compo.leanMass) : undefined,
          metodo: compo.method,
        })
      : undefined,
    banco: { saldoDiasFechados: r0(bank.closed), saldoHojeProjecao: r0(bank.today.balance), saldoTotalProjetado: r0(bank.projected) },
    aderencia: {
      diasFechados: closed.length,
      diasNaMetaMais100: onTarget,
      refeicoesRegistradas: `${mealsLogged} de ${mealsDue}`,
      treinosFeitos: `${done} de ${planned}`,
      mediaPassos: stepVals.length ? r0(stepVals.reduce((a, b) => a + b, 0) / stepVals.length) : undefined,
      diasComPassos: stepVals.length,
    },
    revisao: { titulo: rev.title, mensagem: rev.message, recomendacao: rev.rec },
    gastoAdaptativo: tdee
      ? { kcalPorDia: tdee.tdee, ingestaoMedia: tdee.avgIntake, kgPorSemana: r1(tdee.slopeKgWeek), dias: tdee.days, pesagens: tdee.weighIns }
      : undefined,
    metasDeTreinoHoje: Object.fromEntries(
      TARGET_KEYS.map((k) => [k, { kcalAtivas: tg[k].value, manual: tg[k].manual, calibrada: tg[k].calibrated, amostras: tg[k].samples }]),
    ),
    intervalado: {
      liberadoEm: current.training.intervalsFrom,
      tempoComRpeAte6: crit.tempoRpe,
      fcRepousoEstavel: crit.restingHr,
    },
  });

  const historicoDeProtocolos = versions.map((v, i) =>
    compact({
      id: v.id,
      nome: v.name,
      aPartirDe: v.from,
      ate: versions[i + 1] ? addDays(versions[i + 1].from, -1) : undefined,
      emVigorHoje: v.id === current.id ? true : undefined,
      origem: ORIGEM[v.source],
      criadoEm: v.createdAt,
      observacoes: v.notes,
      metas: v.targets,
      treino: trainingSummary(v),
      mudancas: i > 0 ? diffProtocols(versions[i - 1], v).flatMap((s) => s.lines.map((l) => `${s.title}: ${l}`)) : undefined,
    }),
  );

  const custom = new Map<string, unknown>();
  for (const v of versions) for (const f of v.foods) custom.set(f.id, f);
  const alimentosDisponiveis = [
    ...FOODS.map((f) => compact({ id: f.id, nome: f.name, grupo: f.group, por100g: f.per100, unidade: f.unit, fonte: f.source })),
    ...[...custom.values()],
  ];

  const p = state.profile;
  const data = {
    tipo: EXPORT_TYPE,
    versao: 1,
    instrucaoParaIA: 'Leia e siga o campo "prompt" antes de responder.',
    prompt: promptText(state, today),
    geradoEm: new Date().toISOString(),
    hoje: today,
    comoLer: COMO_LER,
    perfil: p
      ? compact({ nome: p.name, sexo: p.sex === 'M' ? 'masculino' : 'feminino', idade: p.age, alturaCm: p.heightCm, pesoAtualKg: weights.length ? weights[weights.length - 1].value : undefined })
      : null,
    resumo,
    protocoloAtual: toProtocolFile(current),
    historicoDeProtocolos,
    compensacao: state.compensation
      ? compact({
          ativa: state.compensation.active,
          modo: state.compensation.mode,
          inicio: state.compensation.startDate,
          dias: state.compensation.days,
          debitoKcal: state.compensation.debt,
          comidaPorDia: state.compensation.perDayFood,
          atividadeExtraPorDia: state.compensation.perDayActive,
          criadaEm: state.compensation.createdAt,
        })
      : null,
    dias,
    medidas: ms.map(exportMeasurement),
    alimentosDisponiveis,
    formatoDeAtualizacao: formatoDeAtualizacao(today),
  };
  const json = JSON.stringify(data, null, 1);
  return { json, fileName: `protocolo-30-evolucao-${today}.json`, days: dias.length, bytes: new Blob([json]).size };
}

/** Backup técnico (formato do servidor), para restaurar em Ajustes. */
export function buildBackup(state: AppState, today: string): ExportResult {
  const json = JSON.stringify(state);
  return { json, fileName: `protocolo-30-backup-${today}.json`, days: Object.keys(state.days).length, bytes: new Blob([json]).size };
}

/** Só uma versão do protocolo, no formato de importação (serve de modelo para editar). */
export function buildProtocolFile(p: Protocol): ExportResult {
  const json = JSON.stringify(toProtocolFile(p), null, 1);
  const slug = p.from;
  return { json, fileName: `protocolo-30-protocolo-${slug}.json`, days: 0, bytes: new Blob([json]).size };
}
