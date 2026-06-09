# Cobertura Atual de Autorização por Rota

## Objetivo

Mapear como as rotas de negócio do backend estão protegidas hoje, sem alterar comportamento, para orientar uma padronização incremental futura.

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

- Alunos: [backend/routes/alunos.js](/C:/sistema-academia-main/backend/routes/alunos.js)
- Mensalidades: [backend/routes/mensalidades.js](/C:/sistema-academia-main/backend/routes/mensalidades.js), exceto `reverter`
- Pagamentos: [backend/routes/pagamentos.js](/C:/sistema-academia-main/backend/routes/pagamentos.js)
- Financeiro consolidado por unidade: [backend/routes/financeiro.js](/C:/sistema-academia-main/backend/routes/financeiro.js)
- Contas financeiras: [backend/routes/contasFinanceiras.js](/C:/sistema-academia-main/backend/routes/contasFinanceiras.js), exceto `reverter`
- Vendas: [backend/routes/vendasProdutos.js](/C:/sistema-academia-main/backend/routes/vendasProdutos.js), exceto `reverter`
- Fechamento mensal: [backend/routes/fechamentoMensal.js](/C:/sistema-academia-main/backend/routes/fechamentoMensal.js), em `analisar` e `fechar`
- Acessos: [backend/routes/acessos.js](/C:/sistema-academia-main/backend/routes/acessos.js), exceto liberação manual
- Plano associado/vínculos: [backend/routes/planoAssociado.js](/C:/sistema-academia-main/backend/routes/planoAssociado.js)

Outros domínios no mesmo padrão:

- Produtos
- Ativos
- Orçamento
- Plano de contas

### 4. Protegidas por `requirePermission`

Rotas com guarda explícita de permissão:

- Usuários internos:
  - `GET /usuarios-internos`
  - `POST /usuarios-internos`
  - `PATCH /usuarios-internos/:id/papel`
  - `PATCH /usuarios-internos/:id/status`
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
  - `POST /fechamento-mensal/:ano/:mes/reabrir`

### 5. Com checagem manual de papel/permissão

Pontos onde a regra não está só no `requirePermission`:

- Auditoria/logs:
  - [backend/routes/auditLogs.js](/C:/sistema-academia-main/backend/routes/auditLogs.js)
  - usa `assertActiveOperator`, `roleHasPermission` e filtros de escopo manualmente
- Acesso/liberação manual:
  - [backend/routes/acessos.js](/C:/sistema-academia-main/backend/routes/acessos.js)
  - usa `assertPermission(req, PERMISSIONS.ACESSO_LIBERACAO_MANUAL)` dentro da rota
- Alunos:
  - [backend/routes/alunos.js](/C:/sistema-academia-main/backend/routes/alunos.js)
  - `PUT /alunos/:id` só exige permissão explícita se houver mudança de plano com dependentes
- Usuários internos:
  - [backend/services/UserService.js](/C:/sistema-academia-main/backend/services/UserService.js)
  - `platform_admin` tem regra manual adicional para criação/promoção
- Auth:
  - [backend/routes/auth.js](/C:/sistema-academia-main/backend/routes/auth.js)
  - usa checks manuais de `req.authError`, `req.operator` e `blocked`

### 6. Legado / fallback por header

O fallback legado continua existindo em:

- [backend/middlewares/operatorContext.js](/C:/sistema-academia-main/backend/middlewares/operatorContext.js)

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
- não há permissão fina no CRUD geral
- única exceção atual é mudança de plano com dependentes

### Mensalidades e pagamentos

- criação, listagem, atualização e exclusão dependem de escopo
- reversão exige permissão explícita
- pagamento não tem permissão fina própria hoje

### Financeiro

- `contasFinanceiras.js` depende de escopo, com permissão explícita só em reversão
- [backend/routes/dashboardFinanceiro.js](/C:/sistema-academia-main/backend/routes/dashboardFinanceiro.js):
  - `GET /dashboard/financeiro` e `GET /dashboard/financeiro/kpis` dependem de escopo
  - `POST /dashboard/financeiro/sincronizar` não exige `requireScope` nem `requirePermission`

### Vendas

- CRUD principal depende de escopo
- reversão exige permissão explícita

### Fechamento mensal

- `analisar` e `fechar` dependem de escopo
- `reabrir` exige permissão explícita

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

### 1. `planos.js` está fora do padrão atual

- [backend/routes/planos.js](/C:/sistema-academia-main/backend/routes/planos.js)

Hoje:
- não usa `requireScope`
- não usa `requirePermission`
- não checa `req.operator`

Risco:
- domínio de negócio com cobertura de autorização aparentemente inexistente

### 2. `POST /dashboard/financeiro/sincronizar` sem guarda explícita

- [backend/routes/dashboardFinanceiro.js](/C:/sistema-academia-main/backend/routes/dashboardFinanceiro.js)

Hoje:
- não exige autenticação explícita
- não exige escopo
- não exige permissão

Risco:
- operação sensível de sincronização exposta fora do padrão do restante do módulo

### 3. CRUDs críticos dependem só de escopo

Exemplos:
- alunos
- mensalidades
- pagamentos
- contas financeiras
- vendas
- fechamento mensal (`fechar`)

Risco:
- qualquer operador autenticado com unidade válida pode executar ações além do papel desejado, se o domínio não tiver outras travas internas

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

### 5. Fallback legado de operador continua transversal

Risco:
- caminho antigo ainda interfere no contexto de autenticação de rotas protegidas

## Estratégia incremental recomendada

1. Tratar primeiro as rotas claramente fora do padrão:
   - `planos.js`
   - `POST /dashboard/financeiro/sincronizar`
2. Em seguida, separar por domínio quais operações deveriam continuar apenas com escopo e quais precisam de permissão explícita.
3. Migrar primeiro domínios mais sensíveis:
   - financeiro
   - fechamento mensal
   - pagamentos
   - alunos com impacto financeiro
4. Só depois reduzir checks manuais espalhados, aproximando tudo de helpers centrais sem mudar o comportamento em lote.
