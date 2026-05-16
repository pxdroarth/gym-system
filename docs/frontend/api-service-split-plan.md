# Plano de Separacao do Api.js - Frontend

## 1. Objetivo

Mapear as responsabilidades atuais de `frontend/src/services/Api.js` e definir uma separacao incremental por dominio antes do Bloco 4. Este plano nao altera comportamento, endpoints, payloads, autenticacao, `localStorage` ou bearer token.

## 2. Estado atual

`Api.js` mistura duas camadas diferentes:

- infraestrutura HTTP: instancia `axios`, `baseURL`, `withCredentials`, interceptors, bearer token, `X-Unit-Id`, refresh single-flight e handler global de falha de auth;
- funcoes de dominio: alunos, mensalidades, pagamentos, acessos, planos, vinculos, produtos, vendas e aliases legados de mensalidades.

Tambem ja existem services separados que importam a instancia `api` de `Api.js`: `authService.js`, `auditLogService.js`, `usuariosInternosService.js`, `tenantService.js`, `onboardingService.js`, `contasFinanceiras.js`, `dashboardService.js` e `planoContasService.js`.

Nao foram encontrados usos de `fetch`, `window.fetch` ou axios direto fora de `Api.js`. Isso e bom para seguranca de sessao, mas aumenta o cuidado necessario ao dividir o arquivo central.

## 3. O que deve permanecer em Api.js

Idealmente, `Api.js` deve conter apenas:

- `API_BASE_URL`;
- instancia `api = axios.create(...)`;
- `withCredentials: true`;
- request interceptor para bearer token opaco e `X-Unit-Id`;
- response interceptor 401;
- flags internas `_skipAuthHeader`, `_skipAuthRefresh` e `_retry`;
- `refreshPromise` e refresh single-flight;
- `setAuthFailureHandler`;
- `refreshAccessToken`;
- helpers internos inevitaveis do cliente HTTP, como `getRequestPath`, `shouldSkipRefreshRetry`, `unwrapData` e normalizacao minima do usuario retornado por refresh.

Auth core e refresh devem migrar por ultimo, ou permanecer no `Api.js` ate o Bloco 4 estar validado.

## 4. Responsabilidades de dominio encontradas

| Dominio | Funcoes atuais | Arquivos consumidores principais | Risco | Service futuro sugerido | Observacao |
|---|---|---|---|---|---|
| Infra HTTP/Auth client | `api`, `setAuthFailureHandler`, `refreshAccessToken`, interceptors, `refreshPromise` | `authService.js`, `AuthContext.jsx`, todos os services por dominio indiretamente | Alto | manter em `Api.js` | Nao misturar com migracao de dominio; qualquer erro aqui quebra login, refresh e logout. |
| Alunos | `fetchAlunos`, `fetchAlunoById`, `createAluno`, `updateAluno`, `fetchAlunosPesquisa` | `Dashboard.jsx`, `ModalAcessosHoje.jsx`, `AlunosPage.jsx`, `FormAlunoPage.jsx`, `PerfilPage.jsx`, `PlanoAssociadosPage.jsx` | Medio | `alunoService.js` | Muito usado; migrar com wrappers e aliases temporarios. |
| Planos | `fetchPlanos`, `createPlano`, `updatePlano` | `PlanosPage.jsx`, `ModalPlanoForm.jsx`, `FormAlunoPage.jsx`, `PerfilPage.jsx` | Medio | `planoService.js` | Dominio simples, bom candidato para fase inicial apos wrappers. |
| Vinculos/associacoes | `fetchPlanoAssociados`, `createPlanoAssociado`, `deletePlanoAssociado` | `FormAlunoPage.jsx`, `PlanoAssociadosPage.jsx` | Medio | `planoAssociadoService.js` ou `vinculoService.js` | Impacta responsavel/dependente; validar regra de acesso por vinculo apos migrar. |
| Mensalidades | `cadastrarMensalidade`, `fetchMensalidadesPorAluno`, `fetchMensalidades`, `fetchMensalidadesAlunoStatus`, `gerarMensalidadesFuturas`, `updateMensalidadeStatus` | `ModalNovaMensalidade.jsx`, `PerfilPage.jsx`, `PagamentoAntecipado.jsx`, `GerarMensalidadesFuturas.jsx`, `TelaMensalidade.jsx` | Alto | `mensalidadeService.js` | Tem aliases legados e endpoints sensiveis para acesso/financeiro. Migrar depois de dominos simples. |
| Pagamentos | `registrarPagamento`, `registrarPagamentoAntecipado` | `PerfilPage.jsx`, `PagamentoAntecipado.jsx` | Alto | `pagamentoService.js` | Pagamento e snapshot historico devem ser validados em smoke manual. |
| Acessos | `fetchAcessos`, `fetchTodosAcessos`, `simularAcesso` | `PerfilPage.jsx`, `Dashboard.jsx`, `ModalAcessosHoje.jsx` | Alto | `acessoService.js` | Critico depois do DOM-ACESSO-01; migrar com smoke `smoke-acesso.cmd`. |
| Produtos | `fetchProdutos`, `createProduto`, `updateProduto`, `deleteProduto` | `ProdutosPage.jsx`, `ProdutoForm.jsx`, `VendasProdutosPage.jsx` | Medio/Alto | `produtoService.js` | Upload usa `FormData` e `multipart/form-data`; tambem ha URL de imagem duplicada em `ProdutosPage.jsx`. |
| Vendas | `fetchVendasProdutos`, `createVendaProduto` | `VendasProdutosPage.jsx` | Alto | `vendaProdutoService.js` | `fetchVendasProdutos` aceita string ou objeto; preservar compatibilidade temporaria. |
| Auditoria | Ja esta em `auditLogService.js` usando `api` | `HistoricoAtividadesPage.jsx` | Alto | manter `auditLogService.js` | Ja separado; nao precisa voltar para `Api.js`. |
| Usuarios internos | Ja esta em `usuariosInternosService.js` usando `api` | `UsuariosInternosPage.jsx` | Alto | manter `usuariosInternosService.js` | Ja separado; sensivel por papel/status e revogacao de sessao. |
| Tenant/Unit/Consolidado | Ja esta em `tenantService.js` usando `api` | `TenantOverviewPage.jsx`, `OnboardingTenantPage.jsx` | Alto | separar futuro `unitService.js` se crescer | Ja separado parcialmente; units ainda ficam no `tenantService.js`. |
| Onboarding | Ja esta em `onboardingService.js` usando `api` | `OnboardingTenantPage.jsx` | Alto | manter `onboardingService.js` | Ja separado; envolve tenant, unit e usuario inicial. |
| Financeiro/contas | Ja esta em `contasFinanceiras.js`, `dashboardService.js`, `planoContasService.js` | `ContasFinanceirasPage.jsx`, `FinanceiroDashboard.jsx`, `PlanoContasPage.jsx`, `ContaFinanceiraModal.jsx` | Alto | manter services atuais; futuro `financeiroService.js` agregador se necessario | Ja separado, mas ainda depende da instancia central. |

## 5. Endpoints legados/aliases

- `fetchMensalidadesAlunoStatus(alunoId, status)`: alias sobre `GET /mensalidades/aluno/{alunoId}` com query `status`; nao remover sem revisar usos em `PagamentoAntecipado.jsx`.
- `registrarPagamentoAntecipado(payload)`: usa `POST /mensalidades/pagamento-antecipado`; contrato deve ser reconferido antes de renomear ou mover.
- `gerarMensalidadesFuturas(payload)`: usa `POST /mensalidades/gerar-futuras`; manter wrapper compativel.
- `updateMensalidadeStatus(id, status)`: usa `PATCH /mensalidades/{id}/status`; usado por `TelaMensalidade.jsx`, que deve ser revisado contra os status reais antes de qualquer limpeza.
- `simularAcesso(aluno_id)`: usa `/acessos/mock-hikvision`; nome e endpoint refletem simulacao atual, nao integracao Hikvision real.
- `fetchVendasProdutos(params)`: aceita tanto string de query quanto objeto; comportamento deve ser preservado no wrapper futuro.
- `ProdutosPage.jsx` monta URL de imagem com `VITE_API_URL || http://localhost:3001`; isso nao e chamada HTTP, mas e duplicacao de base URL para midia.

## 6. Riscos de migracao

- Quebrar refresh/interceptor se a instancia `api` for duplicada ou substituida em services novos.
- Criar imports circulares entre `authService`, `Api.js` e novos services.
- Perder flags internas de auth em chamadas de login/refresh/logout.
- Alterar sem querer headers de `FormData` em produtos.
- Remover aliases legados ainda usados por telas antigas.
- Trocar nomes de funcoes antes de atualizar consumidores.
- Migrar acessos/mensalidades/pagamentos sem rodar smoke de dominio.
- Confundir URL de API com URL de midia/imagem.
- Fazer Bloco 4 sobre um arquivo ainda inchado, aumentando risco de regressao de sessao.

## 7. Ordem recomendada de separacao

**Fase 1 - criar services wrappers sem alterar comportamento**

Criar services por dominio que apenas reexportam ou chamam as funcoes atuais do `Api.js`, mantendo os imports antigos funcionando. Nao remover exports do `Api.js` ainda.

**Fase 2 - migrar dominios de baixo risco**

Migrar primeiro consumidores de planos simples e produtos de leitura/listagem, mantendo testes de build e tela. Evitar mexer no upload ate a segunda passada de produtos.

**Fase 3 - migrar produtos/planos/alunos**

Mover `produtoService.js`, `planoService.js` e `alunoService.js` para chamadas diretas via `api`. Preservar nomes antigos como aliases temporarios no `Api.js`.

**Fase 4 - migrar financeiro/pagamentos/mensalidades/acessos com cuidado**

Migrar mensalidades, pagamentos e acessos somente com smoke manual e automatizado. Rodar `tests\scripts\smoke-acesso.cmd` apos mexer em acessos. Financeiro deve continuar usando os services ja existentes, com ajustes pequenos.

**Fase 5 - manter auth/interceptor no Api.js**

Nao mover `api`, interceptors, `refreshAccessToken`, `refreshPromise`, flags internas nem `setAuthFailureHandler` durante a separacao de dominio.

**Fase 6 - preparar Bloco 4 com token em memoria**

Depois que os dominios estiverem em services separados e os imports antigos forem removidos, executar Bloco 4 com menor superficie: access token em memoria, refresh cookie HttpOnly e reducao da dependencia de `localStorage`.

## 8. Criterios de aceite para cada fase

- Nenhum endpoint ou payload alterado.
- Nenhuma mudanca em auth, refresh, bearer token ou `localStorage`.
- Imports antigos mantidos ate todos os consumidores migrarem.
- `npm.cmd --prefix frontend run build` passando.
- Smoke manual das telas afetadas pela fase.
- Para acessos: `tests\scripts\smoke-acesso.cmd` passando quando houver mudanca em `acessoService` ou consumidores de acesso.
- Para auth: login, reload, token invalido + refresh cookie, logout e logout-all validados antes de prosseguir.

## 9. Pendencias antes do Bloco 4

- Criar wrappers por dominio sem remover exports do `Api.js`.
- Migrar consumidores gradualmente, evitando PR/sprint gigante.
- Remover duplicacao de URL de midia em `ProdutosPage.jsx` com helper dedicado.
- Reconferir endpoints legados de mensalidades contra backend real antes de apagar aliases.
- Confirmar que nao restaram imports diretos de funcoes de dominio a partir de `Api.js`.
- Manter `Api.js` como infraestrutura HTTP unica antes de alterar armazenamento do access token.

## Atualizacao 3C-G

- Foram criados wrappers por dominio em `frontend/src/services/` para os exports de dominio que ainda vivem em `Api.js`: `alunoService.js`, `planoService.js`, `planoAssociadoService.js`, `mensalidadeService.js`, `pagamentoService.js`, `acessoService.js`, `produtoService.js` e `vendaProdutoService.js`.
- Cada arquivo novo apenas importa e reexporta as funcoes atuais do `Api.js`, preservando assinatura, retorno, endpoint, payload, tratamento de erro e a instancia HTTP central existente.
- `Api.js` permanece como fonte funcional temporaria e continua sendo o unico lugar com cliente HTTP, interceptors, refresh single-flight, auth core e os exports legados consumidos hoje pela aplicacao.
- Nenhum consumidor foi migrado nesta sprint; paginas, componentes e contexto seguem importando de `Api.js` ate a migracao incremental de imports em etapas futuras.
- `auditLogService.js`, `tenantService.js`, `onboardingService.js`, `dashboardService.js`, `contasFinanceiras.js`, `planoContasService.js` e `authService.js` permanecem como services separados ja existentes; nao foi criado wrapper artificial para dominios que nao possuem export real de dominio no `Api.js`.
- Proximos passos recomendados: migrar imports por dominio em PRs pequenos, comecando por fluxos de menor risco, mantendo aliases legados no `Api.js` durante a transicao e validando build + smoke por dominio a cada etapa.
- Auth, interceptor, refresh e o service de auth permanecem fora desta separacao e devem continuar estaveis no `Api.js`/`authService.js` ate o Bloco 4.

## Atualizacao 3C-I

- Consumidores migrados nesta etapa: `frontend/src/pages/vendasProdutos/VendasProdutosPage.jsx` e migracao parcial de `frontend/src/pages/alunos/PerfilPage.jsx`.
- Em `VendasProdutosPage.jsx`, os imports de produtos e vendas sairam de `Api.js` e passaram para `produtoService.js` e `vendaProdutoService.js`, mantendo chamadas, filtros, payloads e retorno exatamente iguais.
- Em `PerfilPage.jsx`, apenas chamadas simples de aluno/plano foram migradas para `alunoService.js` e `planoService.js`; mensalidades, pagamentos e acessos continuam importados de `Api.js` por serem mais sensiveis e pedirem bloco proprio.
- Consumidores mantidos em `Api.js` por risco: `Dashboard.jsx`, `ModalAcessosHoje.jsx`, `ModalNovaMensalidade.jsx`, `PagamentoAntecipado.jsx`, `GerarMensalidadesFuturas.jsx` e `TelaMensalidade.jsx`.
- Dominios ainda pendentes para blocos proprios: mensalidades, pagamentos, acessos/liberacao e financeiro mais sensivel, para evitar migracao em lote de fluxos com regra critica e necessidade de smoke especifico.
- `Api.js` continua compativel e preserva todos os exports legados durante a migracao incremental dos consumidores.

## Atualizacao 3C-J

- Consumidores migrados para `mensalidadeService.js` e `pagamentoService.js`: `frontend/src/pages/alunos/PerfilPage.jsx` nos trechos de mensalidades/pagamento, `frontend/src/pages/alunos/ModalNovaMensalidade.jsx`, `frontend/src/pages/mensalidades/PagamentoAntecipado.jsx`, `frontend/src/components/GerarMensalidadesFuturas.jsx` e `frontend/src/components/TelaMensalidade.jsx`.
- As funcoes migradas mantiveram nomes, parametros, retornos, payloads e endpoints: `cadastrarMensalidade`, `fetchMensalidadesPorAluno`, `fetchMensalidadesAlunoStatus`, `gerarMensalidadesFuturas`, `updateMensalidadeStatus`, `registrarPagamentoAntecipado` e `registrarPagamento`.
- `PerfilPage.jsx` permanece parcialmente em `Api.js` apenas para acessos (`fetchAcessos`, `simularAcesso`), preservando a separacao entre mensalidades/pagamentos e o bloco futuro de acessos/liberacao.
- Continuam para blocos proprios os dominios de acessos/liberacao e financeiro mais amplo, para evitar migracao em lote de fluxos com regra critica e necessidade de smoke dedicado.

## Atualizacao 3C-K

- Consumidores migrados para `acessoService.js`: `frontend/src/pages/Dashboard.jsx`, `frontend/src/components/ModalAcessosHoje.jsx` e o trecho de acessos de `frontend/src/pages/alunos/PerfilPage.jsx`.
- As funcoes migradas mantiveram nomes, parametros, retornos, payloads e endpoints: `fetchAcessos`, `fetchTodosAcessos` e `simularAcesso`.
- `Dashboard.jsx` e `ModalAcessosHoje.jsx` tambem deixaram de importar `fetchAlunos` de `Api.js`, passando a usar `alunoService.js`, o que elimina o uso direto de `Api.js` em paginas e componentes do frontend.
- Nenhuma regra de bloqueio por mensalidade, liberacao manual, auditoria, simulacao ou leitura de historico foi alterada; a mudanca ficou restrita a origem dos imports.
- `Api.js` continua compativel e permanece como fonte central consumida pelos wrappers de service.

## Atualizacao 3C-L

- Fronteira do `Api.js` consolidada no frontend.
- Documento criado: `docs/frontend/api-boundary.md`.
- Regra validada: paginas e componentes nao devem importar `services/Api` diretamente.
- Services por dominio permanecem como fachada publica para a UI.
- `Api.js` continua como infraestrutura HTTP central e mantem exports legados temporarios para compatibilidade.

## Atualizacao Bloco 4

- Access token deixou de ser persistido em `localStorage` e passou a ficar somente em memoria no frontend.
- Reload da aplicacao depende do refresh cookie HttpOnly e de `/auth/refresh` para recuperar a sessao.
- Chaves legadas de auth (`academia_sa_auth_token` e `academia_sa_auth_user`) sao limpas/ignoradas.
- `Api.js` segue como infraestrutura HTTP central, sem nova instancia axios e sem mudanca de endpoints, payloads ou regras de negocio.
- Bloco 5 deve tratar hardening de producao: cookie Secure, HTTPS, CSP e CORS por ambiente.
