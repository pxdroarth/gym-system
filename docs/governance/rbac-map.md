# Mapa Atual de RBAC / Permissões

## Objetivo

Inventariar como papéis, permissões, guards e visibilidade de UI funcionam hoje no sistema, antes de qualquer padronização futura.

## Estado Atual

O sistema já possui uma base real de RBAC, mas ela está distribuída entre:

- papéis e permissões no backend
- checagens de autorização em middlewares e services
- escopo operacional por tenant/unidade
- permissões de UI no frontend
- checagens visuais e condicionais manuais em páginas/componentes

Hoje o backend continua sendo a autoridade final para autorização real.

## Papéis encontrados

Papéis centrais, definidos no backend e espelhados no frontend:

- `platform_admin`
- `owner`
- `admin`
- `gestor`
- `financeiro`
- `recepcao`
- `operador_acesso`

Arquivos-base:
- [backend/constants/userRoles.js](../../backend/constants/userRoles.js)
- [frontend/src/utils/permissions.js](../../frontend/src/utils/permissions.js)

## Backend

### Fonte principal de RBAC

O backend define:

- papéis em `USER_ROLES`
- status de usuário em `USER_STATUS`
- permissões em `PERMISSIONS`
- matriz `ROLE_PERMISSIONS`
- helpers `roleHasPermission`, `isValidRole`, `isValidStatus`

Arquivo principal:
- [backend/constants/userRoles.js](../../backend/constants/userRoles.js)

### Permissões hoje modeladas

Permissões explícitas encontradas:

- `usuarios:criar`
- `usuarios:alterar_papel`
- `usuarios:alterar_status`
- `financeiro:acessar`
- `fechamento:fechar`
- `fechamento:reabrir`
- `plano_contas:gerenciar_rede`
- `vendas:registrar`
- `produtos:gerenciar`
- `reversao:executar`
- `acesso:liberacao_manual`
- `alunos:alterar_plano_com_dependentes`
- `logs:visualizar_total`
- `logs:visualizar_escopo`
- `tenant:consolidado_visualizar`
- `platform:onboarding_executar`
- `platform:tenant_configurar`

### Guard principal

O middleware principal de autorização é:

- [backend/middlewares/requirePermission.js](../../backend/middlewares/requirePermission.js)

Ele:
- falha se houver `req.authError`
- exige `req.operator`
- bloqueia operador com status diferente de `ativo`
- consulta `roleHasPermission(operator.papel, permission)`

### Contexto de autenticação e operador

O operador autenticado é resolvido em:

- [backend/middlewares/operatorContext.js](../../backend/middlewares/operatorContext.js)

Pontos relevantes:
- usa bearer token como fluxo principal
- aceita fallback legado por header `x-operator-id` / `x-user-id` em `NODE_ENV=test` ou com `ALLOW_LEGACY_OPERATOR_HEADERS=true`
- popula `req.operator`, `req.authSession`, `req.authError`

### Escopo tenant/unidade

A autorização real hoje não depende só do papel. Ela também depende de escopo operacional:

- [backend/middlewares/scopeContext.js](../../backend/middlewares/scopeContext.js)
- [backend/helpers/scope.js](../../backend/helpers/scope.js)
- [backend/services/UnitService.js](../../backend/services/UnitService.js)

Comportamento atual:
- resolve `currentUnit`
- resolve `allowedUnits`
- popula `req.scope`
- injeta `tenant_id` e `unit_id` em `req.operator`
- pode bloquear acesso se o usuário não tiver unidade válida

### Rotas protegidas por permissão explícita

Exemplos claros:

- [backend/routes/usuariosInternos.js](../../backend/routes/usuariosInternos.js)
- [backend/routes/units.js](../../backend/routes/units.js)
- [backend/routes/tenants.js](../../backend/routes/tenants.js)
- [backend/routes/onboarding.js](../../backend/routes/onboarding.js)
- [backend/routes/tenantDashboard.js](../../backend/routes/tenantDashboard.js)
- [backend/routes/reversoes.js](../../backend/routes/reversoes.js)
- [backend/routes/mensalidades.js](../../backend/routes/mensalidades.js) em reverter
- [backend/routes/contasFinanceiras.js](../../backend/routes/contasFinanceiras.js) em reverter
- [backend/routes/vendasProdutos.js](../../backend/routes/vendasProdutos.js) em registrar e reverter
- [backend/routes/produtos.js](../../backend/routes/produtos.js) em criar, editar, excluir e ajustar estoque
- [backend/routes/planoContas.js](../../backend/routes/planoContas.js) em criar, editar e excluir categorias
- [backend/routes/fechamentoMensal.js](../../backend/routes/fechamentoMensal.js)

| Ação | Guarda e papéis atuais |
|---|---|
| Registrar venda nos dois aliases `POST /vendas-produtos` e `POST /vendasProdutos` | `vendas:registrar`: dono, admin, gestor e recepção. |
| Criar, editar e excluir produtos e ajustar estoque | `produtos:gerenciar`: dono, admin e gestor. |
| Analisar fechamento | `financeiro:acessar`: dono, admin, financeiro e `platform_admin` no escopo vinculado. |
| Fechar e reabrir período | `financeiro:acessar` mais `fechamento:fechar` para dono/admin ou `fechamento:reabrir` só para dono. Reabrir exige motivo e auditoria. |
| Ler e gerir plano de contas | Leitura com `financeiro:acessar`. Escrita também exige `plano_contas:gerenciar_rede`, hoje exclusiva do dono. Vale para `/plano-contas` e `/planoContas`. |

Vendas, produtos e fechamento usam Rede e Unidade autorizada. As categorias do plano de contas são compartilhadas na Rede, resolvida a partir do escopo autorizado. Consulte a [cobertura por rota](rbac-route-coverage.md).

### Checagens manuais de papel

Além de `requirePermission`, há checagens pontuais por papel:

- [backend/services/UserService.js](../../backend/services/UserService.js)

Exemplo atual:
- apenas `platform_admin` pode criar ou promover usuário para `platform_admin`

### Auditoria e escopo

O histórico de atividades mistura permissão + escopo:

- [backend/routes/auditLogs.js](../../backend/routes/auditLogs.js)

Comportamento atual:
- `logs:visualizar_total` permite filtro amplo
- `logs:visualizar_escopo` permite só dentro do tenant/unidades do operador
- há validação manual extra para `tenant_id` e `unit_id`

## Frontend

### Fonte principal de permissões de UI

O frontend mantém um mapa próprio de papéis e permissões visuais em:

- [frontend/src/utils/permissions.js](../../frontend/src/utils/permissions.js)

Ele define:
- `ROLES`
- `UI_PERMISSIONS`
- `ROLE_UI_PERMISSIONS`
- `roleHasUiPermission`
- `userHasUiPermission`

### Guard global de autenticação

Autenticação de rota no frontend hoje é binária:

- [frontend/src/components/auth/ProtectedRoute.jsx](../../frontend/src/components/auth/ProtectedRoute.jsx)

Comportamento:
- se não estiver autenticado, redireciona para `/login`
- não faz autorização fina por papel

### Guard de UI por permissão

A autorização visual por permissão usa:

- [frontend/src/components/auth/RoleGate.jsx](../../frontend/src/components/auth/RoleGate.jsx)

Comportamento:
- renderiza children se `userHasUiPermission(user, permission)`
- senão renderiza `fallback`

### Navegação condicional

A sidebar é filtrada por permissão de UI:

- [frontend/src/components/Sidebar.jsx](../../frontend/src/components/Sidebar.jsx)

Menus controlados por permissão:
- dashboard
- consolidado
- onboarding
- alunos
- produtos
- vendas
- planos
- associações
- usuários internos
- histórico
- financeiro

### Páginas com gate visual explícito

Exemplos:

- [frontend/src/pages/financeiro/FinanceiroLayout.jsx](../../frontend/src/pages/financeiro/FinanceiroLayout.jsx)
- [frontend/src/pages/tenant/TenantOverviewPage.jsx](../../frontend/src/pages/tenant/TenantOverviewPage.jsx)
- [frontend/src/pages/platform/OnboardingTenantPage.jsx](../../frontend/src/pages/platform/OnboardingTenantPage.jsx)
- [frontend/src/pages/auditoria/HistoricoAtividadesPage.jsx](../../frontend/src/pages/auditoria/HistoricoAtividadesPage.jsx)
- [frontend/src/pages/usuarios/UsuariosInternosPage.jsx](../../frontend/src/pages/usuarios/UsuariosInternosPage.jsx)

### Rotas montadas sem autorização fina

As rotas estão protegidas por autenticação em:

- [frontend/src/App.jsx](../../frontend/src/App.jsx)

Mas a maioria continua montada para qualquer usuário autenticado. A restrição fina acontece mais por:

- ocultação de menu
- `RoleGate` dentro da página
- validação definitiva do backend

### Dependência do payload do usuário

O frontend depende de `user.papel`, `tenant`, `currentUnit` e `allowedUnits` recebidos e persistidos no contexto:

- [frontend/src/contexts/AuthContext.jsx](../../frontend/src/contexts/AuthContext.jsx)

Isso influencia:
- visibilidade de UI
- unidade ativa
- escopo operacional selecionado

## Inconsistências e Riscos

### 1. Duplicação de catálogo de papéis

Os papéis existem em dois lugares:

- backend `USER_ROLES`
- frontend `ROLES`

Risco:
- drift entre backend e frontend
- novo papel adicionado num lado e esquecido no outro

### 2. Duplicação de matriz de permissões

Hoje existem dois mapas paralelos:

- permissões reais do backend
- permissões visuais do frontend

Risco:
- UI esconder demais ou de menos
- sensação de autorização falsa
- custo alto para manter coerência

### 3. Frontend não faz route guard fino

`ProtectedRoute` protege apenas autenticação, não permissão.

Risco:
- rota pode abrir e só falhar dentro da tela
- experiência inconsistente entre menu escondido e acesso direto por URL

### 4. Mistura de papel com escopo operacional

A autorização real hoje depende de:

- papel
- status do operador
- tenant/unidade disponível
- `allowedUnits`
- checks manuais em algumas rotas

Risco:
- regras espalhadas
- bugs de escopo difíceis de rastrear

### 5. Fallback legado por header de operador

`operatorContext` aceita em teste ou com opt-in explícito:

- `x-operator-id`
- `x-user-id`

Risco:
- caminho legado fora do fluxo principal de sessão
- superfície extra para comportamento divergente

### 6. Checagens manuais pontuais

Exemplo atual:
- `platform_admin` tratado manualmente em `UserService`

Risco:
- regras sensíveis fora da matriz central
- necessidade de lembrar exceções em vários pontos

## Leitura prática do estado atual

Hoje o modelo pode ser resumido assim:

1. O backend é a autoridade real.
2. O frontend implementa visibilidade e ergonomia, não segurança final.
3. O RBAC já existe, mas ainda é híbrido:
   - parte centralizada em matriz
   - parte espalhada em checks manuais
   - parte condicionada por escopo tenant/unidade

## Estratégia incremental recomendada

1. Congelar este inventário como baseline.
2. Declarar o backend como fonte única de verdade para papéis e permissões reais.
3. Reduzir gradualmente checks manuais de papel, migrando exceções para constantes/helpers centrais.
4. Revisar páginas do frontend que dependem só de esconder menu e adicionar gate visual consistente onde fizer sentido.
5. Mapear, em bloco separado, quais rotas de negócio ainda não usam `requirePermission` porque dependem apenas de autenticação + escopo.
6. Em fase posterior, avaliar serializar permissões efetivas no `/auth/me` para reduzir drift de UI sem mover a autoridade do backend.
