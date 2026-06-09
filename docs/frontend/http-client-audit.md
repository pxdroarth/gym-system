# Auditoria de Cliente HTTP — Frontend

## 1. Objetivo

Mapear o uso atual de `axios`, `fetch` e wrappers HTTP no frontend do Sistema Academia SA para preparar uma padronizacao segura do cliente HTTP antes do Bloco 4.

Esta auditoria nao altera codigo funcional. O backend usa token opaco server-side, o frontend mantem access token apenas em memoria desde o Bloco 4, e o refresh token continua em cookie HttpOnly `academia_sa_refresh`.

## 2. Estado atual

- O cliente HTTP central e `frontend/src/services/Api.js`.
- O `Api.js` cria uma instancia `axios` com `baseURL` em `VITE_API_URL || http://localhost:3001` e `withCredentials: true`.
- O bearer token e anexado em `Authorization` por interceptor central quando existe token em `authStorage`.
- O refresh de sessao usa `POST /auth/refresh` com `_skipAuthHeader` e `_skipAuthRefresh`.
- O interceptor 401 possui controle single-flight via `refreshPromise`.
- Nao foram encontrados usos de `fetch` ou `window.fetch` em `frontend/src`.
- Nao foram encontrados usos de axios direto fora de `Api.js`.
- `Api.js` tambem concentra funcoes de dominio, alem da infraestrutura HTTP.

## 3. Arquivos com axios

| Arquivo | Funcao/componente | Endpoint | Metodo | Usa Api.js central? | Authorization | withCredentials | Tratamento de erro | Risco | Observacao |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `frontend/src/services/Api.js` | `api` | `VITE_API_URL` ou `http://localhost:3001` | instancia | Sim | Central via interceptor | Sim | Interceptors request/response | Alto | Cliente oficial atual da API interna. |
| `frontend/src/services/Api.js` | `refreshAccessToken` | `/auth/refresh` | POST | Sim | Nao, usa `_skipAuthHeader` | Sim | Single-flight; limpa sessao em falha | Alto | Usa cookie HttpOnly; nao le cookie via JS. |
| `frontend/src/services/authService.js` | `loginRequest` | `/auth/login` | POST | Sim | Nao, usa `_skipAuthHeader` | Sim | Rejeicao axios sanitizada no AuthContext | Alto | Fluxo sensivel; nao envia bearer antigo. |
| `frontend/src/services/authService.js` | `logoutRequest` | `/auth/logout` | POST | Sim | Central via interceptor | Sim | AuthContext limpa local mesmo em erro; sem refresh automatico | Alto | Envia bearer e cookie automaticamente, mas nao tenta renovar em 401. |
| `frontend/src/services/authService.js` | `logoutAllRequest` | `/auth/logout-all` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller; sem refresh automatico | Alto | Funcao existe; uso de UI deve ser confirmado antes de padronizar. |
| `frontend/src/services/authService.js` | `meRequest` | `/auth/me` | GET | Sim | Central via interceptor | Sim | Bootstrap controla erro | Alto | Usada para validar sessao. |
| `frontend/src/services/Api.js` | `fetchAlunos` | `/alunos` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | GET autenticado comum. |
| `frontend/src/services/Api.js` | `fetchAlunoById` | `/alunos/{id}` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | Usa path param. |
| `frontend/src/services/Api.js` | `createAluno` | `/alunos` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | CRUD autenticado. |
| `frontend/src/services/Api.js` | `updateAluno` | `/alunos/{id}` | PUT | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | CRUD autenticado. |
| `frontend/src/services/Api.js` | `fetchAlunosPesquisa` | `/alunos/pesquisa` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | Usa query `termo`, `pagina`, `limite`. |
| `frontend/src/services/Api.js` | `cadastrarMensalidade` | `/mensalidades` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | Dominio financeiro-operacional. |
| `frontend/src/services/Api.js` | `fetchMensalidadesPorAluno` | `/mensalidades/aluno/{alunoId}` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | Usa paginacao. |
| `frontend/src/services/Api.js` | `fetchMensalidades` | `/mensalidades` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | Usa params variaveis. |
| `frontend/src/services/Api.js` | `registrarPagamento` | `/pagamentos` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Pagamento. |
| `frontend/src/services/Api.js` | `fetchAcessos` | `/acessos/aluno/{alunoId}` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Acessos. |
| `frontend/src/services/Api.js` | `fetchTodosAcessos` | `/acessos` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Acessos. |
| `frontend/src/services/Api.js` | `simularAcesso` | `/acessos/mock-hikvision` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Acessos/mock operacional. |
| `frontend/src/services/Api.js` | `fetchPlanos` | `/planos` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Baixo | GET simples. |
| `frontend/src/services/Api.js` | `createPlano` | `/planos` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | CRUD autenticado. |
| `frontend/src/services/Api.js` | `updatePlano` | `/planos/{id}` | PUT | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | CRUD autenticado. |
| `frontend/src/services/Api.js` | `fetchPlanoAssociados` | `/plano-associado/{responsavelId}` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | Associacoes de plano. |
| `frontend/src/services/Api.js` | `createPlanoAssociado` | `/plano-associado` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | Associacoes de plano. |
| `frontend/src/services/Api.js` | `deletePlanoAssociado` | `/plano-associado/{id}` | DELETE | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | Associacoes de plano. |
| `frontend/src/services/Api.js` | `fetchProdutos` | `/produtos` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Baixo | GET simples. |
| `frontend/src/services/Api.js` | `createProduto` | `/produtos` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Upload/FormData com `multipart/form-data`. |
| `frontend/src/services/Api.js` | `updateProduto` | `/produtos/{id}` | PUT | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Upload/FormData com `multipart/form-data`. |
| `frontend/src/services/Api.js` | `deleteProduto` | `/produtos/{id}` | DELETE | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | CRUD autenticado. |
| `frontend/src/services/Api.js` | `fetchVendasProdutos` | `/vendas-produtos` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Vendas; aceita params ou query string. |
| `frontend/src/services/Api.js` | `createVendaProduto` | `/vendas-produtos` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Venda. |
| `frontend/src/services/Api.js` | `fetchMensalidadesAlunoStatus` | `/mensalidades/aluno/{alunoId}` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Medio | Funcao marcada como legado no proprio arquivo. |
| `frontend/src/services/Api.js` | `registrarPagamentoAntecipado` | `/mensalidades/pagamento-antecipado` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Contrato deve ser reconferido antes da migracao. |
| `frontend/src/services/auditLogService.js` | `fetchAuditLogs` | `/audit-logs` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Auditoria. |
| `frontend/src/services/auditLogService.js` | `fetchAuditLogById` | `/audit-logs/{id}` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Auditoria. |
| `frontend/src/services/usuariosInternosService.js` | `listarUsuariosInternos` | `/usuarios-internos` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Usuarios/permissoes. |
| `frontend/src/services/usuariosInternosService.js` | `criarUsuarioInterno` | `/usuarios-internos` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Usuarios/permissoes. |
| `frontend/src/services/usuariosInternosService.js` | `alterarPapelUsuarioInterno` | `/usuarios-internos/{id}/papel` | PATCH | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Permissoes. |
| `frontend/src/services/usuariosInternosService.js` | `alterarStatusUsuarioInterno` | `/usuarios-internos/{id}/status` | PATCH | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Usuarios/permissoes. |
| `frontend/src/services/tenantService.js` | `fetchTenantOverview` | `/tenant-dashboard/resumo` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Tenant/unidade. |
| `frontend/src/services/tenantService.js` | `listarTenants` | `/tenants` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Tenant/unidade. |
| `frontend/src/services/tenantService.js` | `buscarTenant` | `/tenants/{id}` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Tenant/unidade. |
| `frontend/src/services/tenantService.js` | `atualizarTenant` | `/tenants/{id}` | PATCH | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Tenant/unidade. |
| `frontend/src/services/tenantService.js` | `listarUnitsPorTenant` | `/units/tenant/{tenantId}` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Unidade. |
| `frontend/src/services/tenantService.js` | `atualizarUnit` | `/units/{id}` | PATCH | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Unidade. |
| `frontend/src/services/contasFinanceiras.js` | `getContasFinanceiras` | `/contas-financeiras` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Financeiro. Leitura canonica atual das contas financeiras manuais; nao usar as rotas legadas `/financeiro/*`. |
| `frontend/src/services/contasFinanceiras.js` | `criarContaFinanceira` | `/contas-financeiras` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Financeiro. |
| `frontend/src/services/contasFinanceiras.js` | `atualizarContaFinanceira` | `/contas-financeiras/{id}` | PUT | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Financeiro. |
| `frontend/src/services/contasFinanceiras.js` | `marcarComoPago` | `/contas-financeiras/{id}/status` | PATCH | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Financeiro/pagamento. |
| `frontend/src/services/contasFinanceiras.js` | `deletarContaFinanceira` | `/contas-financeiras/{id}` | DELETE | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Financeiro. |
| `frontend/src/services/onboardingService.js` | `criarTenantOnboarding` | `/onboarding/tenants` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Onboarding/tenant. |
| `frontend/src/services/dashboardService.js` | `getDashboardKPIs` | `/dashboard/financeiro/kpis` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller; normaliza arrays | Alto | Financeiro. Endpoint canonico atual para dashboard; nao usar `/financeiro/fluxo`, que permanece apenas como legado com risco de dupla contagem. |
| `frontend/src/services/planoContasService.js` | `getPlanoContas` | `/plano-contas` | GET | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Financeiro. |
| `frontend/src/services/planoContasService.js` | `createPlanoConta` | `/plano-contas` | POST | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Financeiro. |
| `frontend/src/services/planoContasService.js` | `updatePlanoConta` | `/plano-contas/{id}` | PUT | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Financeiro. |
| `frontend/src/services/planoContasService.js` | `deletePlanoConta` | `/plano-contas/{id}` | DELETE | Sim | Central via interceptor | Sim | Rejeicao axios para caller | Alto | Financeiro. |

## 4. Arquivos com fetch

| Arquivo | Funcao/componente | Endpoint | Metodo | credentials | Authorization | FormData/upload | Tratamento de erro | Risco | Observacao |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nenhum | Nenhum | Nenhum | Nenhum | Nao aplicavel | Nao aplicavel | Nao aplicavel | Nao aplicavel | Baixo | Nao foram encontrados `fetch(` ou `window.fetch` em `frontend/src`. |

## 5. Clientes/wrappers existentes

- `frontend/src/services/Api.js`: instancia central axios, interceptors, refresh single-flight, anexacao de bearer token, `X-Unit-Id` e funcoes de dominio historicas.
- `frontend/src/services/authService.js`: wrapper de auth para login, logout, logout-all, me e refresh.
- `frontend/src/utils/authStorage.js`: store em memoria para access token e usuario, com limpeza de chaves legadas de auth em `localStorage`/`sessionStorage`.
- `frontend/src/contexts/AuthContext.jsx`: orquestra bootstrap, login/logout, validacao de sessao, refresh e estado autenticado.
- Services por dominio: `auditLogService.js`, `usuariosInternosService.js`, `tenantService.js`, `contasFinanceiras.js`, `onboardingService.js`, `dashboardService.js`, `planoContasService.js`.
- `frontend/src/pages/produtos/ProdutosPage.jsx`: possui `VITE_API_URL || http://localhost:3001` para montar URL de imagem, nao para chamada HTTP.

## 6. Problemas encontrados

- `Api.js` mistura infraestrutura HTTP e muitas funcoes de dominio; isso aumenta o risco de mudancas amplas no cliente central.
- O tratamento de erro e heterogeneo: a maioria dos services apenas propaga erro axios, e as paginas tratam mensagens de formas diferentes.
- `authService.loginRequest` usa o cliente central sem explicitar `_skipAuthHeader`; se houver token antigo no storage, o interceptor pode enviar bearer tambem no login.
- Existem endpoints legados em `Api.js` ligados a mensalidades que devem ser reconferidos contra as rotas reais antes de qualquer migracao automatica.
- O fluxo legado `gerarMensalidadesFuturas` e o endpoint `/mensalidades/gerar-futuras` foram removidos do frontend por serem incompatíveis com a regra atual: nao existe geracao automatica cega de mensalidades para alunos ativos.
- O wrapper frontend `updateMensalidadeStatus` foi removido. `PATCH /mensalidades/{id}/status` permanece apenas como compatibilidade para status nao financeiros e nao deve ser tratado como fluxo de pagamento/quitacao.
- A base `http://localhost:3001` aparece tambem em `ProdutosPage.jsx` para imagens; nao e chamada HTTP, mas e duplicacao de base URL.
- Dominios de alto risco estao no mesmo padrao generico de erro/retry: auth, auditoria, financeiro, pagamentos, vendas, acessos, usuarios/permissoes, tenant/onboarding e upload de produtos.
- Nao foram encontrados `fetch` sem credentials, chamadas axios diretas fora do cliente central ou montagem manual de bearer fora de `Api.js`.
- `localStorage` e `sessionStorage` nao devem armazenar bearer token; chaves legadas de auth sao removidas pela camada de sessao.

## 7. Padrao recomendado

- Manter `Api.js` como cliente oficial para API interna.
- Usar uma instancia axios central com `withCredentials: true`.
- Anexar `Authorization: Bearer <opaque token>` por interceptor central.
- Manter refresh single-flight no interceptor 401.
- Marcar chamadas de auth internas com flags explicitas: `_skipAuthRefresh` e, quando aplicavel, `_skipAuthHeader`.
- Manter `authService` como camada segura de auth sobre o cliente central.
- Criar helper padrao de erro humano, como `getApiErrorMessage(error)`, antes de migrar dominios criticos.
- Permitir `fetch` apenas como excecao documentada: upload/stream especial, API externa isolada ou caso tecnico justificado.
- Separar gradualmente infraestrutura HTTP de funcoes de dominio para reduzir acoplamento.

## 8. Plano de migracao incremental

**Fase A: Auth/API client central**

Conferir flags de auth, manter single-flight, documentar uso oficial de `Api.js` e padronizar helper de erro.

**Fase B: servicos criticos**

Revisar `authService`, `usuariosInternosService`, `tenantService` e `onboardingService`, com foco em permissoes, unidade ativa e falhas 401/403.

**Fase C: financeiro/auditoria/pagamentos**

Padronizar `auditLogService`, `dashboardService`, `contasFinanceiras`, `planoContasService`, `registrarPagamento` e vendas com tratamento de erro consistente.

**Fase D: dominios comuns**

Migrar alunos, planos, associacoes, produtos e mensalidades para services por dominio, mantendo o mesmo contrato externo das paginas.

**Fase E: remocao de duplicacoes**

Remover duplicacao de base URL para midia por meio de helper dedicado e reduzir funcoes de dominio dentro de `Api.js`.

**Fase F: preparacao para Bloco 4**

Confinar uso de `localStorage` ao minimo necessario, preparar access token em memoria e manter refresh cookie HttpOnly sem leitura via JavaScript.

## 9. Pendencias antes do Bloco 4

- Validar contra backend real os endpoints legados de mensalidades antes de migrar ou remover chamadas.
- Definir helper oficial de erro para mensagens de usuario.
- Decidir estrategia para URL de midia/imagens sem duplicar `localhost:3001`.
- Confirmar uso real de `logoutAllRequest` na UI antes de padronizar fluxo visual.
- Manter testes manuais de login, refresh, logout, reload e token invalido antes de remover `localStorage`.

## Atualização 3C-B

- Flags internas padronizadas no cliente central: `_skipAuthHeader`, `_skipAuthRefresh` e `_retry`.
- `loginRequest` chama `/auth/login` com `_skipAuthHeader: true` e `_skipAuthRefresh: true`, evitando envio de bearer antigo.
- `refreshSession` continua usando o fluxo central de `refreshAccessToken`, que chama `/auth/refresh` sem bearer e sem refresh automatico.
- `logoutRequest` e `logoutAllRequest` continuam podendo enviar o bearer atual, mas nao tentam refresh automatico se receberem 401.
- Criado `frontend/src/utils/getApiErrorMessage.js` para mensagem humana sem expor token, cookie, stack trace ou objeto bruto.
- A migracao de mensagens de erro dos dominios ficou para fase seguinte; nesta etapa o helper foi usado apenas no fluxo central de login/AuthContext.

## Atualização 3C-C

- `getApiErrorMessage` foi aplicado de forma incremental em pontos criticos de baixo risco: login, usuarios internos, historico/auditoria, contas financeiras e vendas de produtos.
- O escopo ficou limitado a mensagens de erro exibidas ao usuario; nao houve mudanca de endpoint, payload, regra de negocio, bearer token ou `localStorage`.
- Fluxos de auth core, refresh cookie e interceptor 401 nao foram alterados nesta etapa.
- Ainda ficam pendentes dominios como pagamentos/mensalidades, acessos, produtos, planos, onboarding/tenant e modais financeiros.
- Bloco 4 segue pendente para remover a persistencia do access token em `localStorage` e preparar token em memoria.

## Atualização 3C-D

- `getApiErrorMessage` foi aplicado em fluxos criticos de pagamentos, mensalidades e acessos.
- Arquivos alterados: `PerfilPage.jsx`, `PagamentoAntecipado.jsx`, `ModalNovaMensalidade.jsx`, `TelaMensalidade.jsx`, `GerarMensalidadesFuturas.jsx`, `ModalAcessosHoje.jsx` e `Dashboard.jsx`.
- O escopo ficou limitado a mensagens de erro e remocao de logs com objeto bruto; endpoints, payloads, regras de negocio, auth core, bearer token e `localStorage` nao foram alterados.
- Ainda ficam pendentes dominios como produtos, planos, onboarding/tenant, dashboard financeiro, plano de contas e modais financeiros restantes.
- Bloco 4 segue pendente para remover a persistencia do access token em `localStorage` e preparar token em memoria.

## Atualizacao 3C-E

- `getApiErrorMessage` foi aplicado nos dominios restantes priorizados: produtos, planos, associacoes de planos, onboarding/tenant, consolidado da rede, seletor de unidade, dashboard financeiro, plano de contas, modal de conta financeira e fluxos comuns de alunos.
- Arquivos alterados: `ProdutoForm.jsx`, `ProdutosPage.jsx`, `ModalPlanoForm.jsx`, `PlanosPage.jsx`, `PlanoAssociadosPage.jsx`, `OnboardingTenantPage.jsx`, `TenantOverviewPage.jsx`, `UnitScopeSelector.jsx`, `FinanceiroDashboard.jsx`, `PlanoContasPage.jsx`, `ContaFinanceiraModal.jsx`, `AlunosPage.jsx` e `FormAlunoPage.jsx`.
- O escopo ficou limitado a mensagens de erro exibidas ao usuario e reducao de logs com objeto bruto; endpoints, payloads, regras de negocio, auth core, bearer token e `localStorage` nao foram alterados.
- Nao foram encontrados usos de `fetch` nem axios direto fora da infraestrutura central nesta etapa.
- Dominios ainda pendentes devem ser tratados apenas se surgirem novos fluxos ou mensagens manuais em telas futuras; Bloco 4 segue pendente para remover a persistencia do access token em `localStorage` e preparar token em memoria.

## Atualizacao 3C-I

- Consumidores de risco medio de produtos, vendas e leituras simples de aluno/plano seguem migrando para wrappers de dominio, enquanto acessos, mensalidades e pagamentos permanecem em `Api.js` por exigirem etapa propria com validacao mais cautelosa.

## Atualizacao 3C-J

- Os consumidores de mensalidades e pagamentos passaram a importar os wrappers de `mensalidadeService.js` e `pagamentoService.js`, enquanto os fluxos de acessos permanecem centralizados em `Api.js` para um bloco separado.

## Atualizacao LEGACY-03B

- A referencia documental a `gerarMensalidadesFuturas` e ao endpoint `/mensalidades/gerar-futuras` foi marcada como removida.
- O frontend nao promove mais esse fluxo como endpoint ativo.
- A regra vigente e contratacao/renovacao assistida; geracao automatica cega de mensalidades permanece incompatível com o produto atual.

## Atualizacao LEGACY-03E

- `PATCH /mensalidades/{id}/status` foi documentado como rota de compatibilidade nao financeira.
- `pago` e `parcial` nao devem ser enviados por rotas genericas de mensalidade; o backend bloqueia esses status.
- Pagamento canonico continua em `POST /pagamentos` e contratacao/renovacao assistida continua em `POST /planos/contratar-renovar`.

## Atualizacao LEGACY-04D

- As rotas legadas de `backend/routes/financeiro.js` em `/financeiro/*` nao devem ser usadas como fonte canonica.
- Dashboard financeiro atual: `GET /dashboard/financeiro/kpis`.
- Contas financeiras manuais: `/contas-financeiras`.
- Pagamento canonico: `POST /pagamentos`.
- Contratacao/renovacao canonica: `POST /planos/contratar-renovar`.
- Diagnostico operacional read-only: `tests/scripts/diagnostico-consistencia.cmd`.

## Atualizacao 3C-K

- Os consumidores de acessos passaram a usar `acessoService.js`, enquanto leituras auxiliares de alunos nesses mesmos pontos usam `alunoService.js`; com isso, `Api.js` deixa de ser importado diretamente por paginas e componentes, permanecendo como base dos wrappers.

## Atualizacao 3C-L

- A fronteira arquitetural do `Api.js` foi consolidada e documentada em `docs/frontend/api-boundary.md`, reforcando a regra de consumo via services por dominio para paginas e componentes.

## Atualizacao Bloco 4

- Access token passou a ficar somente em memoria no frontend; reload usa refresh cookie HttpOnly via `/auth/refresh`.
- `authStorage.js` limpa e ignora chaves legadas de auth em `localStorage`/`sessionStorage`, incluindo `academia_sa_auth_token` e `academia_sa_auth_user`.
- Bloco 5 permanece responsavel por hardening de producao: cookie Secure, HTTPS, CSP e CORS por ambiente.

## Atualizacao 3C-G

- Foram adicionados wrappers de dominio em `frontend/src/services/` que reexportam as funcoes atuais do `Api.js` sem mudar comportamento, cliente HTTP ou auth core.
- Nesta etapa, os consumidores continuam importando de `Api.js`; a migracao de imports fica para PRs incrementais posteriores, conforme o plano em [`docs/frontend/api-service-split-plan.md`](api-service-split-plan.md).

## Atualizacao 3C-F

- Foi criado o plano de separacao incremental do `Api.js`, sem alterar codigo funcional, imports, endpoints, payloads, auth core, bearer token ou `localStorage`.
- Documento: [`docs/frontend/api-service-split-plan.md`](api-service-split-plan.md).
- O plano mantem `Api.js` como infraestrutura HTTP central e propõe migrar funcoes de dominio para services por etapas antes do Bloco 4.
