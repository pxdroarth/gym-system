# Cobertura Atual de Autorização por Rota

## Objetivo

Mapear como as rotas de negócio do backend estão protegidas hoje, sem alterar comportamento, para orientar uma padronização incremental futura.

## L02 · Cobertura da DN-3

| Rota ou fluxo | Guarda e escopo |
| --- | --- |
| `POST /alunos`, `PUT /alunos/:id` | `alunos:editar` na unidade. Edição compara status, vencimento e plano antes de gravar. A guarda de associações vale nos aliases já existentes. |
| `POST /mensalidades/padrao` | `mensalidades:emitir_padrao` e unidade do aluno. Cálculo e deduplicação na transação. O corpo indica o aluno. |
| `POST /mensalidades`, `PUT`, `PATCH /:id/status`, `DELETE` | `mensalidades:gerenciar`. Desconto excepcional em criação exige permissão e motivo. Edição comum não concede desconto. |
| `PATCH /mensalidades/:id/desconto` | `mensalidades:desconto`. Motivo, cobrança em aberto sem pagamento, período editável e auditoria. |
| `POST /pagamentos` | `pagamentos:registrar` inclui recepção e gestor. Mantém escopo, saldo, pagamento parcial e chave de idempotência. |
| Estorno e reversões de pagamentos, mensalidades, vendas e contas | Guardas anteriores continuam validando papel e escopo. A execução direta exige aprovação e está bloqueada com `409 REVERSAO_APROVACAO_NECESSARIA`. Abrange aliases e exclusão de conta paga. Edição comum de conta paga não pode neutralizar valor, tipo, data ou status. O estorno de venda passou a ter fluxo próprio de solicitação, autorização (direta ou externa registrada) e execução (seção "L04 · Estorno de venda"). Pagamentos, mensalidades e contas seguem bloqueados. |
| `/fechamento-mensal/:ano/:mes` | Conferência com Financeiro. Fechar exige admin ou dono na unidade. Reabrir exige dono, motivo e auditoria. Política master pendente. |
| `/tenant-dashboard/resumo` | Relatório filtrado pelos vínculos do admin. Integral requer `relatorios:rede_integral`. |
| `POST/PUT/DELETE /planos`, `/plano-contas` e `/planoContas` | Permissões distintas de catálogo e financeiro da Rede, disponíveis ao dono. O fluxo combinado Contratar/Renovar usa permissão própria de operação. |
| `DELETE /usuarios-internos/:id/vinculo-unidade` | Admin ou dono, com vínculo na unidade selecionada, escopo e hierarquia GS-03. Revoga sessões após desativar o vínculo local. |

## L04 · Escritas de venda, produto e estoque

| Rotas | Permissão | Papéis |
|---|---|---|
| `POST /vendas-produtos`, `POST /vendasProdutos` | `vendas:registrar` | Dono, admin, gestor e recepção |
| `POST /produtos`, `PUT /produtos/:id`, `DELETE /produtos/:id`, `PATCH /produtos/:id/estoque` | `produtos:gerenciar` | Dono, admin e gestor |

Todas essas escritas exigem Rede e Unidade autorizada. Os dois aliases de venda compartilham o mesmo roteador. Validação em [smoke-l04-integridade.js](../../tests/scripts/smoke-l04-integridade.js).

## L04 · Estorno de venda

As rotas valem nos dois aliases, `/vendas-produtos` e `/vendasProdutos`, que montam o mesmo roteador. Cada etapa exige a própria permissão e a unidade selecionada; o serviço repete identidade, papel, Rede e Unidade dentro da transação. Registro de outra Rede ou unidade pelo ID: `404`. Unidade sem vínculo no `X-Unit-Id`: `403 UNIT_FORBIDDEN`. Regras em [L04 — Estorno de venda](requisitos-base.md#l04--estorno-de-venda).

| Rota | Permissão | Papéis e recusas |
|---|---|---|
| `POST /:id/estornos` (solicitar, com `motivo`) | `vendas:estorno_solicitar` | Recepção, gestor, financeiro, admin e dono. Pedido ativo existente: `200` com `Idempotent-Replayed: true` e o pedido existente, sem alterar o estado. |
| `POST /estornos/:estornoId/aprovar` (aprovação direta) | `vendas:estorno_aprovar` | Gestor, admin e dono. Quem solicitou recebe `403 AUTOAPROVACAO_PROIBIDA`, mesmo após mudar de papel. |
| `POST /estornos/:estornoId/autorizacao-externa` (`autorizador_id`, `canal` `whatsapp`/`email`, `autorizado_em` como `AAAA-MM-DDTHH:MM` no fuso da unidade ou ISO com fuso, `referencia`) | `vendas:estorno_registrar_autorizacao` | Recepção, financeiro, admin e dono. Informar a própria conta: `403 AUTOAUTORIZACAO_PROIBIDA`. Autorizador igual ao solicitante: `403 AUTOAPROVACAO_PROIBIDA`. Autorizador inativo, sem vínculo na unidade/Rede ou sem `vendas:estorno_aprovar`: `422 AUTORIZADOR_SEM_PERMISSAO`. Dados inválidos: `400`. Data inexistente no calendário, anterior ao minuto da venda ou posterior ao minuto do registro: `400 DATA_AUTORIZACAO_INVALIDA`. |
| `POST /estornos/:estornoId/executar` (com `itens`) | `vendas:estorno_executar` | Recepção, financeiro, admin e dono. Sem aprovação: `409 REVERSAO_APROVACAO_NECESSARIA`. Unidade com três contas distintas e executor igual ao solicitante ou ao autorizador: `403 CONTAS_DISTINTAS_EXIGIDAS`. Venda sem receita original ativa no escopo: `409 VENDA_SEM_RECEITA_ORIGINAL` (conciliação), sem gravar nada. |
| `GET /estornos` (filtros `status` e `venda_id`) | Qualquer uma das quatro acima | Recepção, gestor, financeiro, admin e dono |
| `GET /estornos/autorizadores` | `vendas:estorno_registrar_autorizacao` | Contas ativas da unidade com `vendas:estorno_aprovar`, sem a do operador. |
| `GET /estornos/politica` | Qualquer uma das quatro acima | Lê se a unidade exige três contas distintas. |
| `PATCH /estornos/politica` (`contas_distintas` booleano) | Papel `owner` | Somente o dono; demais: `403 PERMISSAO_NEGADA`. Auditado. |

`platform_admin` e `operador_acesso` não recebem essas permissões; a atuação do suporte depende do sublote de controles master. As reversões diretas de venda (`POST /:id/reverter` nos dois aliases e `POST /reversoes/vendas/:id`) continuam bloqueadas com `409 REVERSAO_APROVACAO_NECESSARIA`. Validação em [smoke-l04-estorno-venda.js](../../tests/scripts/smoke-l04-estorno-venda.js), [smoke-l04-estorno-venda-datas.js](../../tests/scripts/smoke-l04-estorno-venda-datas.js) e [ui-l04-estorno-venda.py](../../tests/scripts/ui-l04-estorno-venda.py).

## Categorias encontradas

### 1. Públicas

Rotas sem autenticação obrigatória por desenho atual:

- `GET /health`
- `GET /test-db`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /relatorios` placeholder

Risco:
- `health` é esperado como público
- `test-db` e `relatorios` merecem revisão futura de exposição em ambiente não local

### 2. Autenticadas sem permissão fina

Rotas que dependem de autenticação manual (`req.operator`, `req.authError`) mas não usam `requirePermission`:

- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /auth/me`
- `GET /usuarios-internos/me`
- `GET /units/me`

### 3. Autenticadas com escopo tenant/unidade

Rotas que dependem principalmente de `requireScope(req)`.

Padrão atual:
- exigem operador resolvido + unidade válida
- filtram por `tenant_id` / `unit_id`
- não distinguem papel por ação na maior parte do CRUD

Domínios prioritários nessa categoria:

- Alunos: consultas em [backend/routes/alunos.js](../../backend/routes/alunos.js). Escritas seguem a tabela do L02.
- Mensalidades: consultas em [backend/routes/mensalidades.js](../../backend/routes/mensalidades.js). Escritas seguem a tabela do L02.
- Pagamentos: [backend/routes/pagamentos.js](../../backend/routes/pagamentos.js), exceto registrar (`pagamentos:registrar`) e estornar (`reversao:executar`)
- Vendas: consultas em [backend/routes/vendasProdutos.js](../../backend/routes/vendasProdutos.js). Registro segue o L04 e reversão tem guarda própria.
- Acessos: [backend/routes/acessos.js](../../backend/routes/acessos.js), exceto liberação manual
- Plano associado/vínculos: consultas em [backend/routes/planoAssociado.js](../../backend/routes/planoAssociado.js). Criar e excluir exigem `alunos:alterar_plano_com_dependentes`.

Outros domínios no mesmo padrão:

- Consultas de produtos

O módulo Financeiro saiu desta categoria (ver seção 4, "Módulo Financeiro").

### 4. Protegidas por `requirePermission`

Rotas com guarda explícita de permissão:

- Usuários internos:
  - `GET /usuarios-internos`
  - `POST /usuarios-internos`
  - `PATCH /usuarios-internos/:id/papel`
  - `PATCH /usuarios-internos/:id/status`
  - `GET /usuarios-internos/opcoes` (`usuarios:visualizar`; GS-03)
  - `PATCH /usuarios-internos/:id/unidades` (`usuarios:alterar_unidades`; GS-03)
  - Além da permissão, todas aplicam escopo de Rede/unidades e hierarquia no `UserService` (ver `matriz-permissoes.md`, seção 7.1).
- Tenants:
  - `GET /tenants`
  - `GET /tenants/:id`
  - `PATCH /tenants/:id`
- Units administrativas:
  - `GET /units/tenant/:tenantId`
  - `PATCH /units/:id`
- Onboarding:
  - `POST /onboarding/tenants`
- Tenant dashboard:
  - `GET /tenant-dashboard/resumo`
- Reversões:
  - `POST /reversoes/mensalidades/:id`
  - `POST /reversoes/vendas/:id`
  - `POST /reversoes/contas-financeiras/:id`
- Reversões embutidas em domínio:
  - `POST /mensalidades/:id/reverter`
  - `POST /vendasProdutos/:id/reverter`
  - `POST /contasFinanceiras/:id/reverter`
- Fechamento mensal:
  - `POST /fechamento-mensal/:ano/:mes/fechar` (`fechamento:fechar`)
  - `POST /fechamento-mensal/:ano/:mes/reabrir` (`fechamento:reabrir`)

#### Módulo Financeiro (`financeiro:acessar`)

Montado em [backend/server.js](../../backend/server.js) com `requirePermission(PERMISSIONS.FINANCEIRO_ACESSAR)` antes do router, o que cobre todas as rotas e aliases do módulo. Sem sessão: `401`. Papel sem a permissão: `403`. A regra é a mesma do frontend (`NAV_FINANCEIRO`): `platform_admin`, `owner`, `admin` e `financeiro`. `gestor`, `recepcao` e `operador_acesso` não acessam.

| Montagem | Rotas | Permissão adicional por ação |
|---|---|---|
| `/dashboard/financeiro` | `GET /`, `GET /kpis` | `POST /sincronizar`: `financeiro:sincronizar` |
| `/contas-financeiras`, `/contasFinanceiras` | `GET`, `POST`, `PUT /:id`, `PATCH /:id/status`, `DELETE /:id` | `POST /:id/reverter` e `DELETE` de conta paga: `reversao:executar` |
| `/plano-contas`, `/planoContas` | `GET`, `POST`, `PUT /:id`, `DELETE /:id` | Escritas: `plano_contas:gerenciar_rede`, exclusiva do dono |
| `/financeiro/ativos` | `GET`, `POST`, `PUT /:id`, `DELETE /:id` | — |
| `/financeiro/orcamento` | `GET`, `POST`, `PUT /:id`, `DELETE /:id` | — |
| `/fechamento-mensal` | `GET /:ano/:mes/analisar` | `fechar`: `fechamento:fechar`; `reabrir`: `fechamento:reabrir` |
| `/reversoes/contas-financeiras/:id` | — | `financeiro:acessar` + `reversao:executar` |

Escopo dos dados:

- **Plano de contas: compartilhado por Rede.** As categorias são filtradas só por `tenant_id`; todas as unidades da mesma Rede veem e usam as mesmas categorias.
- **Contas financeiras, ativos, orçamento e fechamento mensal: Rede e Unidade.** Filtram por `tenant_id` e `unit_id` da sessão; cada unidade vê e altera apenas os próprios registros, e o fechamento de uma unidade não afeta as demais. O dashboard e os indicadores seguem o mesmo escopo.
- Registro de outra Rede pelo ID (ou, nos domínios por unidade, de outra unidade): `404`, sem efeito. Ativos e orçamento passaram a responder `404` quando nada foi alterado.
- Unidade de outra Rede no `X-Unit-Id`: `403 UNIT_FORBIDDEN`.

Categoria: `plano_contas_id` de conta financeira precisa ser da Rede da operação, conferido na mesma transação da gravação (`422 PLANO_CONTAS_INVALIDO`, sem gravar). A listagem só mostra o nome da categoria quando ela é da Rede do lançamento. Lançamentos automáticos e contrapartidas de estorno só herdam categoria da mesma Rede; sem categoria válida, ficam sem categoria, com valor e origem preservados.

Validação: `tests/scripts/smoke-financeiro-isolamento.js`.

Papéis com permissão ([userRoles.js](../../backend/constants/userRoles.js)). `financeiro:acessar` e `reversao:executar` estão disponíveis a `platform_admin`, `owner`, `admin` e `financeiro`, com a execução direta de estorno bloqueada. `fechamento:fechar` pertence a `owner` e `admin`. `fechamento:reabrir` pertence apenas a `owner` e exige motivo e auditoria.

Em contas manuais, `POST` e `PATCH /:id/status` usam a permissão geral `financeiro:acessar`. A [matriz](matriz-permissoes.md#61-contas-financeiras--divergência-entre-matriz-e-api) registra os 15 cenários observados e as duas decisões em aberto para o perfil financeiro.

### 5. Com checagem manual de papel/permissão

Pontos onde a regra não está só no `requirePermission`:

- Auditoria/logs:
  - [backend/routes/auditLogs.js](../../backend/routes/auditLogs.js)
  - usa `assertActiveOperator`, `roleHasPermission` e filtros de escopo manualmente
- Acesso/liberação manual:
  - [backend/routes/acessos.js](../../backend/routes/acessos.js)
  - usa `assertPermission(req, PERMISSIONS.ACESSO_LIBERACAO_MANUAL)` dentro da rota
- Alunos:
  - [backend/routes/alunos.js](../../backend/routes/alunos.js)
  - `PUT /alunos/:id` só exige permissão explícita se houver mudança de plano com dependentes
- Usuários internos:
  - [backend/services/UserService.js](../../backend/services/UserService.js)
  - `platform_admin` tem regra manual adicional para criação/promoção
- Auth:
  - [backend/routes/auth.js](../../backend/routes/auth.js)
  - usa checks manuais de `req.authError`, `req.operator` e `blocked`

### 6. Legado / fallback por header

O fallback legado continua existindo em:

- [backend/middlewares/operatorContext.js](../../backend/middlewares/operatorContext.js)

Headers aceitos:
- `x-operator-id`
- `x-user-id`

Impacto atual:
- qualquer rota que dependa de `req.operator` ou `requireScope` ainda pode ser influenciada por esse caminho legado
- não substitui `requirePermission`, mas afeta autenticação/contexto

## Domínios prioritários

### Auth

- `login` e `refresh` são públicos por desenho
- `logout`, `logout-all` e `me` usam autenticação manual
- não usam `requirePermission`

### Usuários internos

- CRUD sensível já está protegido por `requirePermission`
- `me` usa apenas autenticação manual
- ainda há regra manual adicional para `platform_admin`

### Alunos

- domínio protegido por escopo
- cadastro e edição exigem `alunos:editar`; campos sensíveis e mudança de plano com dependentes têm guardas adicionais

### Mensalidades e pagamentos

- listagens dependem de escopo; as escritas de mensalidades têm permissões de emissão, gestão ou desconto
- reversão e estorno de pagamento exigem `reversao:executar`
- registrar pagamento exige `pagamentos:registrar`

### Financeiro

- todo o módulo exige `financeiro:acessar` (ver seção 4, "Módulo Financeiro")
- estorno, sincronização, fechar e reabrir exigem também a permissão própria da ação
- `backend/routes/financeiro.js` e as rotas `/financeiro/*` legadas antigas foram removidos; `/financeiro/ativos` e `/financeiro/orcamento` são as rotas atuais

### Vendas

- consultas usam escopo; registro nos dois aliases usa `vendas:registrar`
- estorno segue solicitação (`vendas:estorno_solicitar`), aprovação direta (`vendas:estorno_aprovar`) ou registro de autorização externa (`vendas:estorno_registrar_autorizacao`) e execução (`vendas:estorno_executar`); a unidade pode exigir três contas distintas; a reversão direta continua bloqueada

### Fechamento mensal

- `analisar` exige `financeiro:acessar`
- `fechar` exige `financeiro:acessar` + `fechamento:fechar`
- `reabrir` exige `financeiro:acessar` + `fechamento:reabrir`

### Acesso / liberação manual

- consultas e tentativa normal dependem de escopo
- liberação manual exige checagem explícita dentro da rota
- `PUT` e `DELETE` foram endurecidos para sempre negar

### Auditoria / logs

- não usa `requirePermission` diretamente
- faz checagem manual combinando permissão e escopo
- já existe separação entre visão total e visão por escopo

### Tenants / unidades

- área administrativa mais madura
- rotas críticas usam `requirePermission`
- `GET /units/me` usa apenas autenticação manual

## Riscos prioritários

### 1. `planos.js` · cobertura do catálogo

- [backend/routes/planos.js](../../backend/routes/planos.js)

As rotas de leitura resolvem o escopo. As mutações do catálogo exigem permissão de Rede. A comercialização de plano exclusivo ainda depende do modelo de distribuição.

### 2. `POST /dashboard/financeiro/sincronizar` é rota sensível e deve permanecer auditada

- [backend/routes/dashboardFinanceiro.js](../../backend/routes/dashboardFinanceiro.js)

Hoje:
- exige `requirePermission(PERMISSIONS.FINANCEIRO_SINCRONIZAR)`
- exige escopo via `requireScope(req)` dentro da rota
- executa sincronização financeira manual, não agendada

Risco residual:
- continua sendo operação sensível e merece revisão periódica de RBAC, auditoria e escopo

### 3. Leituras operacionais dependem de escopo

Consultas de alunos, mensalidades, vendas e produtos não distinguem papéis por ação na API. As escritas desses domínios têm guardas próprias descritas acima.

### 4. Mistura de estilos de autorização

Hoje coexistem:
- `requirePermission`
- `requireScope`
- checks manuais de `req.operator`
- checks manuais de `roleHasPermission`
- checks in-route com `assertPermission`

Risco:
- difícil auditar cobertura real
- fácil introduzir drift entre domínios

### 5. Fallback legado de operador em teste ou opt-in

Risco:
- em `NODE_ENV=test` ou com `ALLOW_LEGACY_OPERATOR_HEADERS=true`, o caminho legado também pode resolver o operador

## Estratégia incremental recomendada

1. Tratar primeiro as rotas claramente fora do padrão:
   - `planos.js`
   - `POST /dashboard/financeiro/sincronizar`
2. Em seguida, separar por domínio quais operações deveriam continuar apenas com escopo e quais precisam de permissão explícita.
3. Migrar primeiro domínios mais sensíveis:
   - financeiro (feito: `financeiro:acessar` no módulo inteiro)
   - fechamento mensal (feito)
   - pagamentos (registrar e estornar já têm permissão própria)
   - produtos e estoque (escritas cobertas no L04)
   - alunos com impacto financeiro
4. Só depois reduzir checks manuais espalhados, aproximando tudo de helpers centrais sem mudar o comportamento em lote.
