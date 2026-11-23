# Protocolo 30

Painel pessoal para seguir o plano de 30 dias pelo celular: cardápio com horários e macros, registro de cada refeição, treinos com dados do Apple Watch, banco de calorias com compensação automática, peso e medidas com datas, e um modelo 3D do corpo que muda conforme as medidas.

Tudo roda no seu servidor. Não usa IA nem serviços externos: os cálculos são feitos no próprio app. Quando quiser uma análise, você exporta um arquivo e leva para a IA que preferir (veja abaixo).

## O que o app faz

- **Hoje**: dia do protocolo, calorias e macros consumidos até agora, a refeição do momento com os alimentos em gramas e botões para registrar se seguiu, comeu a mais, comeu menos, pulou ou trocou. Também mostra os treinos do dia, os passos, o peso da manhã e o saldo do banco.
- **Refeições**: o dia inteiro (qualquer data), com os totais de calorias, proteína, carboidrato e gordura, os ajustes em gramas quando há compensação, o que foi comido fora do plano e as substituições equivalentes.
- **A mais / A menos**: ajuste cada item do prato (toque no nome para marcar que não comeu, ou mude as gramas) e adicione o que comeu fora do prato, como um copo de refrigerante. O cálculo usa exatamente essas quantidades.
- **Horários**: ao registrar, o app guarda a hora em que você comeu. Se foi 15 min ou mais fora do previsto, as próximas refeições do dia andam junto (mais tarde ou mais cedo). Os treinos seguram o horário: o pré-treino não passa de 30 min antes da musculação, o atraso de antes do treino não empurra o pós-treino e nada passa das 20:30.
- **Treino**: spinning e musculação planejados por data, registro de calorias ativas e totais, FC média e esforço percebido (RPE), passos, calendário de 30 dias, zonas para configurar no Apple Watch e histórico.
- **Banco**: saldo de calorias (crédito ou débito) em relação ao plano, extrato diário e um planejador de compensação em 1 a 14 dias, pela comida, por atividade extra ou pelos dois. O planejador respeita limites seguros. Também dá para escolher absorver o débito e aceitar um pequeno atraso.
- **Progresso**: peso em jejum com tendência, ritmo semanal, modelo 3D com linha do tempo e comparação com o primeiro registro, gráficos de cada medida, composição corporal estimada, revisão do dia 14 e gasto calórico real estimado pela balança.
- **Ajustes**: exportar a evolução para uma IA, atualizar o protocolo por arquivo, histórico de versões, metas, agenda, limites do banco e backup.

## Exportar para IA e atualizar o protocolo

1. Em **Ajustes → Dados e IA**, toque em **Exportar evolução (.json)**. No iPhone abre a folha de compartilhamento: mande o arquivo direto para o app do Claude (ou outra IA), salve em Arquivos ou use **Copiar como texto** para colar numa conversa.
2. O arquivo traz tudo: perfil, resumo (peso, cintura, composição, banco, aderência, revisão), o protocolo em vigor, o histórico de versões, todos os dias (refeições, extras, treinos, passos e saldo), medidas e compensações. Ele já vem com um **prompt** dizendo à IA como analisar e como devolver mudanças.
3. Se a IA sugerir mudanças, ela devolve um JSON no formato `protocolo-30/protocolo`. Em **Atualizar protocolo**, escolha o arquivo (ou cole a resposta inteira: o app acha o JSON no meio do texto). Antes de aplicar, o app mostra o que muda, os erros que impedem a importação e os avisos (ex.: cardápio que não bate com a meta, proteína abaixo de 1,6 g/kg).
4. A mudança vira uma **nova versão** com data de início. Os dias anteriores continuam calculados com a versão que valia neles, então o banco e o histórico não mudam para trás. Dá para apagar uma versão em **Ajustes → Protocolo em vigor → Versões**.

O arquivo pode ser completo ou parcial: o que não vier continua igual. Exemplo mínimo:

```json
{
  "tipo": "protocolo-30/protocolo",
  "nome": "Semana 3 · mais passos",
  "aPartirDe": "2026-12-07",
  "observacoes": "Passos para 12 mil.",
  "protocolo": { "targets": { "kcal": 2150, "p": 197, "c": 215, "f": 56, "steps": 12000 } }
}
```

Seções aceitas em `protocolo`: `targets` (meta diária), `meals` (cardápio completo, com itens `{ "food": id, "grams": g }`, `{ "label", "kcal", "p", "c", "f" }` ou `{ "free": "texto" }`), `foods` (alimentos novos, valores por 100 g), `training` (dias, horários, sessões de spinning, metas de calorias ativas, zonas), `bank` (limites do banco), `reductionLadder` (ordem dos cortes) e `substitutions`. Em **Protocolo em vigor → Baixar este protocolo** você tem o arquivo completo da versão atual para usar de modelo.

## Como o banco de calorias calcula

Todo dia é comparado com o plano.

| Item | Cálculo |
|---|---|
| Comida | Meta do dia menos o que você comeu. Uma refeição sem registro conta como plano seguido. |
| Treino | Calorias ativas do relógio menos a meta da sessão. Treino não feito desconta a meta inteira. |
| Passos | (passos − meta) × kcal por passo, que é calculado pelo seu peso. |

- Créditos de treino e de passos valem 75%, porque relógios costumam superestimar o gasto. Os débitos valem 100%. A porcentagem pode ser mudada em Ajustes.
- A meta de cada tipo de treino é calibrada pela mediana das suas 3 primeiras sessões registradas. Se uma versão nova do protocolo muda aquela sessão, a calibração dela recomeça.
- Sem as calorias do relógio, "Fiz parte" conta como metade da meta da sessão.
- Na compensação, o app corta no máximo 300 kcal de comida por dia, nunca deixa o dia abaixo de 1.950 kcal e pede no máximo 300 kcal ativas extras. A proteína e o pré-treino ficam sempre intactos. Com a compensação ativa (ou com a meta abaixo do cardápio), tocar em **Segui** registra a refeição já com o corte do dia.
- Cada dia usa as metas e o cardápio da versão do protocolo que valia nele.

## Publicar no Easypanel

1. **Token do GitHub (só se o repositório for privado).** No GitHub, abra Settings → Developer settings → Personal access tokens.
   - Token clássico: marque o escopo `repo`. Para o deploy automático, marque também `admin:repo_hook`.
   - Token fine-grained: dê acesso ao repositório `protocolo-30` com Contents de leitura e, para o deploy automático, Webhooks de leitura e escrita.

   No Easypanel, vá em **Settings → Github**, cole o token e salve.
2. **Criar o serviço.** Abra um projeto, clique em **New Service** e escolha **App**.
3. **Source.** Escolha **GitHub** e preencha:
   - Repositório: `lucasaraujosgc-hue/protocolo-30`
   - Branch: `main`
   - Build Path: `/`

   O Easypanel encontra o `Dockerfile` sozinho; se pedir, em **Build** escolha **Dockerfile**.
4. **Environment.** Adicione a variável abaixo, trocando pela sua senha:

   ```
   APP_PASSWORD=uma-senha-forte-aqui
   ```

   `SESSION_SECRET` é opcional. Se ficar vazio, o app gera um e guarda no volume.
5. **Storage (obrigatório).** Adicione um **Volume** com o nome `data` e o caminho de montagem `/app/data`. Sem isso, seus registros somem a cada novo deploy.
6. **Domains.** Adicione o domínio que você quer usar e coloque **3000** como porta de destino.
7. Clique em **Deploy**. Para publicar sozinho a cada push no GitHub, use **Enable Auto Deploy**.
8. No iPhone, abra o endereço no Safari e toque em Compartilhar → **Adicionar à Tela de Início**. O app abre em tela cheia, como um aplicativo.

Na primeira vez, o app pede a senha e depois altura, idade e o dia 1 do protocolo.

## Backups

- O servidor guarda uma cópia automática por dia (últimos 30 dias) em `/app/data/backups`, e outra antes de cada restauração.
- Em **Ajustes → Backup** você salva o backup completo (formato do servidor) e o restaura depois. O arquivo para IA é outro: ele serve para análise, não para restaurar.

## Rodar no computador

```bash
npm install
cp .env.example .env    # defina APP_PASSWORD
npm run build
APP_PASSWORD=sua-senha npm start   # http://localhost:3000
```

Para desenvolver com recarga automática, deixe o servidor rodando (`APP_PASSWORD=... npm run dev:server`) e, em outro terminal, rode `npm run dev` (http://localhost:5173). Os testes dos cálculos rodam com `npm test`.

## Estrutura

```
server/            API em Express: login por senha, validação e armazenamento em JSON com backup diário
web/src/lib/       protocolo versionado (cardápio, metas, treinos, regras do banco), exportação para IA,
                   alimentos e o motor de cálculo (banco, compensação, composição)
web/src/screens/   telas: Hoje, Refeições, Treino, Banco, Progresso e Ajustes
web/src/components modelo 3D (three.js), gráficos, folhas de registro
```

## Aviso

O app organiza um plano de emagrecimento e estima valores com fórmulas, que têm margem de erro. Ele não substitui o acompanhamento de nutricionista e médico.
