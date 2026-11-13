# Scripts de Teste

Os scripts PowerShell/CMD são os primeiros testes automatizados do projeto. Eles servem para smoke rápido e validação local repetível.

Eles não substituem Playwright, Insomnia, k6 ou JMeter; cada ferramenta cobre uma camada diferente da qualidade.

## `smoke-auth.ps1`

### Objetivo

Validar rapidamente o fluxo crítico de autenticação backend do Sistema Academia SA.

### Pré-requisitos

- Backend rodando em `http://localhost:3001`, salvo uso de `-BaseUrl`.
- Usuário local válido.
- PowerShell disponível no Windows.
- Banco SQLite local e dados fictícios/teste preparados.

### Execução

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -Login admin
```

Se `-Senha` não for informado, o script solicita a senha no terminal.

Exemplo completo:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -BaseUrl "http://localhost:3001" -Login admin -Senha "SUA_SENHA" -UnitId 1
```

### Parâmetros

- `BaseUrl`: URL base da API. Padrão: `http://localhost:3001`.
- `Login`: login do usuário que executará o smoke. Obrigatório.
- `Senha`: senha do usuário. Opcional; se ausente, o script solicita no terminal.
- `UnitId`: unidade enviada em `X-Unit-Id`. Padrão: `1`.

### Resultado

- `exit code 0`: passou.
- `exit code 1`: falhou.

### Validações feitas

- `/test-db`
- login
- cookie HttpOnly
- `/auth/me`
- refresh
- token antigo inválido
- logout
- logout-all

## `smoke-acesso.js`

### Objetivo

Validar a regra critica de acesso/mensalidade do DOM-ACESSO-01 sem depender do frontend nem de senha real.

### Pre-requisitos

- Node.js disponivel.
- Dependencias ja instaladas na raiz do projeto.
- Banco SQLite local/demo disponivel.
- Usar somente em ambiente local/demo, nunca em producao.

### Execucao

```cmd
tests\scripts\smoke-acesso.cmd
```

Alternativa direta com Node:

```cmd
node tests\scripts\smoke-acesso.js
```

### Fixtures

- O teste cria tenant, unidade, plano, alunos, mensalidades, acessos e auditoria com prefixo `SMOKE_ACESSO_`.
- A limpeza antes/depois remove apenas registros associados a esse prefixo e aos alunos criados pelo teste.
- O script nao altera schema, nao cria migration e nao usa dados reais.

### Validacoes feitas

- aluno ativo sem mensalidade bloqueado.
- mensalidade vencida bloqueada.
- mensalidade parcial vencida bloqueada.
- mensalidade parcial dentro do prazo bloqueada por ausencia de cobertura paga vigente.
- mensalidade em aberto dentro do prazo bloqueada por ausencia de cobertura paga vigente.
- vencimento no dia atual com mensalidade em aberto bloqueado por ausencia de cobertura paga vigente.
- mensalidade paga liberada.
- `POST /acessos` comum nao burla a regra.
- liberacao manual sem motivo bloqueada.
- liberacao manual com motivo/operador auditada em `audit_log`.
- `PUT /acessos/:id` bloqueado com `ACESSO_REGISTRO_IMUTAVEL`.
- `DELETE /acessos/:id` bloqueado com `ACESSO_REGISTRO_IMUTAVEL`.

## `reset-admin-password.js`

### Objetivo

Resetar senha de usuario interno/admin no SQLite local usando o mesmo hash do AuthService.

### Uso seguro (somente local/admin)

```cmd
tests\scripts\reset-admin-password.cmd admin
```

- Informe a nova senha apenas no prompt interativo do terminal.
- Nunca passe senha por argumento.
- Nunca commitar senha real.
- O script revoga sessoes/tokens ativos do usuario informado.
- Ao finalizar, execute `tests\scripts\smoke-auth.cmd` para validar o login.

## Diagnostico de consistencia operacional

### `diagnostico-consistencia.js`

Objetivo:
inspecionar o banco SQLite local real em modo somente leitura para procurar inconsistencias entre cobertura, mensalidade, pagamento, plano e financeiro.

Execucao:

```cmd
tests\scripts\diagnostico-consistencia.cmd
```

Observacoes:

- abre o SQLite com `sqlite3.OPEN_READONLY`
- nao altera dados
- nao executa `INSERT`, `UPDATE` ou `DELETE`
- nao sincroniza financeiro
- nao cria mensalidade
- nao registra pagamento
- pode retornar achados informativos esperados, como aluno `AVULSO_MENSAL` ativo sem cobertura paga vigente
- achados `critico` ou `alto` indicam inconsistencia que exige revisao operacional

### `smoke-diagnostico-consistencia.js`

Objetivo:
testar o proprio diagnostico, validando se ele detecta inconsistencias controladas.

Execucao:

```cmd
tests\scripts\smoke-diagnostico-consistencia.cmd
```

Observacoes:

- cria uma copia temporaria do banco local
- injeta inconsistencias controladas apenas nessa copia
- roda o diagnostico contra a copia temporaria
- valida se checks `critico` e `alto` sao detectados
- remove os arquivos temporarios ao final
- nao altera o banco real

### Diferenca entre os comandos

- `diagnostico-consistencia`: inspeção read-only do banco real local
- `smoke-diagnostico-consistencia`: teste automatizado do proprio diagnostico

### Regras de seguranca

- nenhum dos dois corrige dados
- nenhum dos dois e scheduler
- nenhum dos dois e `node-cron`
- nenhum dos dois gera mensalidades
- nenhum dos dois sincroniza financeiro
- nenhum dos dois deve ser confundido com reconciliacao automatica

### Quando usar

- apos mudancas em mensalidades, pagamentos, financeiro, cobertura ou planos
- antes de criar scheduler futuro
- antes ou depois de manutencao operacional sensivel
- como apoio a auditoria local

## `smoke-identidade.js` (GS-03)

### Objetivo

Validar isolamento de identidade e escopo pela API: Matriz → Filial, Filial → Matriz, Rede A → Rede B, hierarquia de papéis, bloqueio de promoção a `platform_admin`, unidade obrigatória, revogação de sessão ao mudar unidades, auditoria e repetição após refresh de sessão.

### Pré-requisitos

- API rodando sobre base criada com `npm run db:seed:dev`. **Não rodar em base real**: o smoke cria a Rede B `smoke-identidade-rede-b` e usuários `smoke.*`.
- Senhas: `SEED_DEV_PASSWORD` (padrão `dev12345`) e `SMOKE_PLATFORM_PASSWORD` (padrão `BOOTSTRAP_ADMIN_PASSWORD` ou `admin123`).

### Execução

```cmd
node tests\scripts\smoke-identidade.js --base-url=http://localhost:3001
```

Rode de novo depois de reiniciar a API para cobrir o cenário de reinício. Exit code `0` passou, `1` falhou.

## `diagnostico-vinculos.js` (GS-03)

Diagnóstico **somente leitura** dos vínculos usuário ↔ Rede/Unidade. Abre o SQLite em modo leitura e lista vínculos de origem não confirmada, usuários em mais de uma Rede, mais de uma unidade padrão e usuários ativos sem unidade.

```cmd
node tests\scripts\diagnostico-vinculos.js [caminho\academia.sqlite]
```

Tratamento dos achados: `docs/governance/vinculos-escopo-legado.md`.

## `smoke-f0-acesso-datas.js` (GS-07 F0)

Valida em processo, com relógio fixo: P2 (mensalidade futura em aberto não esconde cobertura paga vigente; débito vencido, pré-pago e legado sem datas mantêm a regra atual), P9 (data local da operação, inclusive na virada das 21h de Brasília) e P10 (edição preserva cobertura e observações não enviadas). Use base descartável criada com `npm run db:seed:dev`; as fixtures `SMOKE_F0_*` são removidas no fim.

```cmd
node tests\scripts\smoke-f0-acesso-datas.js
```

## `smoke-p1-pagamentos.js` (GS-07 P1)

Valida pela API o pagamento parcial e o estorno por pagamento: mensalidade de R$ 80, paga 50 (saldo 30), 31 recusado, paga 30 (quitada), reenvio com a mesma chave sem duplicar, recusa de estorno direto dos 30 (quitação e competência preservadas, sem contrapartida), 403 para quem não tem `reversao:executar`, 404 de outra unidade e concorrência (dois pagamentos simultâneos sobre o mesmo saldo; a mesma chave em paralelo). Com `--db`, confere também lançamentos, reversão e auditoria na base (somente leitura). Use base descartável criada com `npm run db:seed:dev` e a API rodando sobre ela.

```cmd
node tests\scripts\smoke-p1-pagamentos.js --base-url=http://localhost:3001 --db=backend\academia.sqlite
```

## `smoke-isolamento-transacao.js` (GS-07 P1.1)

Valida em processo que uma gravação de outra requisição fica fora da transação aberta: abre a transação, dispara uma gravação independente, força o rollback e confere que a independente persistiu. Cobre também leitura não confirmada, trabalho agendado após o commit, transações simultâneas e `runTransaction` aninhado. Usa só a tabela temporária `smoke_isolamento_tx`. Base descartável.

```cmd
node tests\scripts\smoke-isolamento-transacao.js
```

## `ui-p1-1-pagamento.py` (GS-07 P1.1)

Teste de tela (Playwright para Python) do botão de pagamento do perfil do aluno: clique duplo, resposta perdida por falha de rede e timeout do cliente. Em todos os casos deve existir um único pagamento e um único lançamento. Pré-requisitos e uso no cabeçalho do arquivo; o frontend precisa subir com `VITE_PAGAMENTO_TIMEOUT_MS=2000`.

## `smoke-s1-p0.js` (S1-P0 · Contenção)

Valida pela API, com resultado por requisito:

- **FV-02a:** reversões de venda, conta e mensalidade pela Rede B e pela Filial sobre registros da Matriz da Rede A, nas rotas legadas `/reversoes/*` e nas rotas de domínio (404, com estoque, lançamentos, reversões e auditoria inalterados); recepção sem `reversao:executar` (403); lançamento derivado (409); execução direta aguarda aprovação e deixa estoque, saldos e auditoria intactos.
- **FV-05:** uploads recusados (sem login, token inválido, unidade não permitida, HTML disfarçado de PNG, SVG, payload inválido, acima de 2 MB, nome duplicado) não deixam arquivo em disco; PNG, JPEG e WebP válidos continuam funcionando; arquivos ativos já existentes em `/uploads` (html, svg, js, html com extensão .png) não são publicados.
- **FV-02c:** mesmo mês fechado numa unidade e aberto na outra; a venda na unidade fechada é bloqueada sem baixa de estoque e a da unidade aberta segue.

Rode depois do `smoke-identidade` (que cria a Rede B), em base descartável criada com `npm run db:seed:dev` e a API rodando sobre ela. O smoke fecha e reabre o mês corrente e planta arquivos de teste em `backend/uploads/produtos` (removidos no fim).

```cmd
node tests\scripts\smoke-s1-p0.js --base-url=http://localhost:3001 --db=backend\academia.sqlite
```

## `smoke-a06-conta-fechamento.js` (achado A-06)

Valida pela API que a edição de conta financeira confere o mês original e o mês de destino do lançamento, na unidade da operação: fechado → aberto, aberto → fechado e fechado → fechado recusam com `423 PERIODO_FECHADO`, deixando o lançamento intacto e sem auditoria nova; aberto → aberto continua funcionando; o fechamento de uma unidade não afeta a outra. Base descartável criada com `npm run db:seed:dev` e a API rodando sobre ela; o smoke fecha e reabre o mês anterior na Matriz e na Filial.

```cmd
node tests\scripts\smoke-a06-conta-fechamento.js --base-url=http://localhost:3001 --db=backend\academia.sqlite
```

## `smoke-financeiro-isolamento.js` (S1 · Financeiro)

Cria pelo onboarding duas academias fictícias (Alfa e Beta), cada uma com uma unidade e usuários owner, financeiro, recepção, gestor e operador, e valida pela API:

- **R1 isolamento:** listagens só com dados próprios; unidade da outra Rede no `X-Unit-Id` → 403; registro da outra Rede pelo ID → 404, sem efeito.
- **R2 acesso ao Financeiro:** sem sessão → 401; recepção, gestor e operador → 403 em dashboard e indicadores, contas, plano de contas, ativos, orçamento e análise do fechamento (com aliases); recepção segue consultando alunos e registrando entrada.
- **R3 categoria:** conta com plano de contas de outra Rede → 422, sem gravar; categoria própria funciona; nome da categoria só aparece quando ela é da Rede do lançamento, inclusive em registro antigo; lançamentos automáticos sem categoria válida ficam sem categoria, com valor e origem preservados. Reversões sem aprovação não geram contrapartida.
- **R4 estorno e fechamento:** recepção → 403 ao estornar; financeiro recebe 409 no estorno direto e 403 ao fechar e ao reabrir. Owner fecha e reabre com motivo; negativas preservam pagamento e fechamento.

Use **apenas base descartável**: para simular um registro antigo, o smoke grava uma linha direto na base.

```cmd
node tests\scripts\smoke-financeiro-isolamento.js --base-url=http://localhost:3001 --db=backend\academia.sqlite
```

## `smoke-l02.js` (DN-3 · Permissões operacionais)

Use base descartável semeada e rode após `smoke-identidade.js`. O parâmetro `--db` é obrigatório e deve apontar para o mesmo SQLite que a API usa. O smoke lê o banco sem escrever diretamente. Não rode outras operações nessa base durante as comparações.

```cmd
node tests/scripts/smoke-l02.js --base-url=http://localhost:3001 --db=backend/academia.sqlite
node tests/scripts/smoke-l02-ciclos.js
```

- **HTTP e SQLite.** Três requisições simultâneas ao mesmo processo da API, para o mesmo aluno e ciclo, devem devolver uma criação e duas reutilizações. No banco, confira uma cobrança, um lançamento pendente do mesmo valor, nenhum pagamento criado e uma única auditoria de emissão concluída. A transação SQLite serializa a operação nessa configuração. Esta evidência não cobre múltiplas instâncias da API.
- **Recusas.** Emissão e desconto comparam as linhas de mensalidade, pagamento e conta financeira antes e depois. As respostas de recusa ficam no log HTTP. O teste verifica separadamente que não houve evento de operação concluída em `audit_log`. Não exige a criação de um evento de auditoria para cada tentativa negada.
- **Relógio controlado.** O smoke de ciclos chama o serviço real e usa o SQLite da cópia descartável onde o script roda. Ele injeta instantes de referência no relógio de negócio e mantém a conversão para São Paulo. Com plano de R$ 100 e vencimento dia 31, a primeira cobrança em 27/02/2025 cobre um dia de um ciclo de 28 dias (R$ 3,57). Em 28/02/2024, cobre um dia de um ciclo de 29 dias (R$ 3,45). O próximo vencimento cai no último dia de fevereiro, a virada para março reutiliza a cobrança daquele ciclo, e o vencimento volta ao dia 31 em março. As datas e os valores esperados são explícitos. Este smoke exercita o serviço em sequência.
- **Reemissão proporcional.** No smoke de ciclos, o dono cancela a cobrança de 27/02/2025 sem pagamento e a recepção reemite na mesma data. O teste exige R$ 3,57 com vencimento em 27/02, reutilização da substituta em nova tentativa, preservação do histórico cancelado e um único lançamento a receber ativo.
- **Catálogo da Rede.** O smoke HTTP cadastra titulares na Matriz e na Filial com o mesmo plano individual e verifica a edição apenas do nome pelo dono. Um plano familiar com titular e dois dependentes na Filial impede a redução para duas pessoas a partir da Matriz. A redução é aceita após encerrar um vínculo. O teste preserva a recusa de edição pelo admin e a recusa de exclusão de plano em uso em outra unidade.

### Adaptações dos smokes anteriores pela DN-3

| Smoke | Mudança e regra aprovada | Cobertura que ficou pendente |
| --- | --- | --- |
| `smoke-s1-p0.js` | Reversão direta agora exige aprovação. Testa `409` e estado preservado na venda, conta e mensalidade legada, nos aliases e na exclusão de conta paga. A reabertura da preparação usa o dono com motivo obrigatório. As verificações de upload, escopo e venda em mês fechado continuam. | Reversão executada após aprovação, consumo único da aprovação, reposição de estoque, contrapartida e trilha dos atores e da unidade. |
| `smoke-p1-pagamentos.js` | O lançamento de R$ 80 da fixture fornece motivo para valor excepcional. Estorno direto bloqueado mantém os dois pagamentos, a competência e R$ 80 líquidos, sem contrapartida ou auditoria de execução. Parcial, saldo, idempotência e concorrência de pagamentos continuam testados. | Estorno aprovado dos R$ 30, preservação dos R$ 50, saldo reaberto de R$ 30, contrapartida, novo pagamento e recusa de segunda execução. |
| `smoke-a06-conta-fechamento.js` | O dono reabre as unidades da fixture com motivo, conforme a DN-3. As verificações A-06 de meses de origem e destino e de isolamento permanecem. | A interface nova de fechamento é de outro sublote. A regra A-06 mantém sua cobertura neste smoke. |
| `smoke-financeiro-isolamento.js` | Financeiro pode conferir, mas o estorno direto fica bloqueado e não gera contrapartida. Reabertura exige dono com motivo. A Rede Beta agora fecha e reabre de fato seu período, com status e unidade verificados, antes de confirmar que o período da Alfa permaneceu intacto. Os testes de categorias de Rede para leitura e lançamentos automáticos continuam. | Contrapartida de execução aprovada preserva valor e origem e usa somente categoria válida da própria Rede, inclusive nos registros legados. |

Os estornos de pagamento, mensalidade e conta permanecem bloqueados até o fluxo próprio. O estorno de venda já tem solicitação, autorização (direta ou externa registrada) e execução, validados nos smokes `smoke-l04-estorno-venda*` abaixo.

## `smoke-l04-estorno-venda.js` (L04 · Estorno de venda pela API)

Rode em base descartável semeada, com a API sobre ela. O smoke cria produtos, vendas, um gestor da Matriz, um gestor e um admin da Filial e uma Rede B pelo onboarding, fecha e reabre o mês corrente na Matriz, liga e desliga a opção de três contas na Matriz e lê o SQLite só para conferir os efeitos.

```cmd
node tests\scripts\smoke-l04-estorno-venda.js --base-url=http://localhost:3001 --db=backend\academia.sqlite
```

Cobre permissões por etapa e papel, pedido único por venda (reenvio e solicitações concorrentes devolvem o existente), execução sem aprovação (inclusive pelas rotas diretas legadas), escopo de Rede e Unidade (também do autorizador externo), autoaprovação antes e depois da mudança de papel, autoautorização, validação da autorização externa, aprovação direta do gestor, autorização externa por WhatsApp e e-mail registrada pelo atendente e pelo financeiro, o atendente solicitando e executando, quantidades inválidas, reposição parcial e zero, corrida entre aprovação direta e registro externo, a mesma aprovação executada em paralelo, repetição, mês fechado com nova tentativa após reabertura e a opção de três contas distintas. Cada recusa confere venda, estoque, lançamentos, estados e auditoria antes e depois.

## `smoke-l04-estorno-venda-datas.js` (L04 · Períodos, data operacional e rollback)

Roda em processo, sobre o SQLite da cópia descartável semeada, e controla só o relógio de negócio (como o `smoke-l02-ciclos.js`). Usa os anos de 2030 e 2031 e grava fechamentos e datas de venda direto na base.

```cmd
node tests\scripts\smoke-l04-estorno-venda-datas.js
```

Cobre mês da venda fechado, mês do estorno fechado, mês do lançamento original gravado em UTC, nova tentativa com a mesma aprovação após reabertura, virada do dia e do mês em Brasília (22h–24h, quando a data em UTC já é o dia seguinte), rollback completo quando a última gravação da transação falha, venda sem receita original ativa no escopo (excluída ou em outra unidade: `409 VENDA_SEM_RECEITA_ORIGINAL`, sem contrapartida nem evento de execução, e execução após a conciliação) e a data da autorização externa: limites da janela por minuto, data e hora inexistentes, um minuto antes da venda, horário futuro, autorização válida anterior à abertura do pedido e venda legada só com data (dia anterior recusado; mesmo dia e dia seguinte aceitos até o minuto do registro, sem horário gravado na venda).

## `ui-l04-estorno-venda.py` (L04 · Estorno de venda pela tela)

Playwright para Python. Com a API em `localhost:3001` e o frontend em `localhost:5173` sobre base descartável, o atendente solicita pela tela de Vendas, registra a autorização que o gestor deu por WhatsApp e executa; o gestor aprova no sistema outro pedido e vê bloqueada a aprovação do próprio; o dono liga a opção de três contas na aba Financeiro → Estornos de venda e o atendente deixa de poder executar o próprio pedido. Cobre a recusa sem motivo, a lista de autorizadores sem a própria conta, a origem da autorização e quem atuou em cada etapa, a quantidade acima da vendida, a mensagem de período fechado com a aprovação preservada, a execução após reabertura e a visão no celular. Os prints vão para `test-results/ui-l04-estorno` (variável `GS_SHOTS`).

```cmd
python tests\scripts\ui-l04-estorno-venda.py
```
