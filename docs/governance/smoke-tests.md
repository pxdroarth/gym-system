# Smoke Tests - Sistema Academia SA

## 1. Objetivo

Estes smoke tests validam rapidamente se o sistema sobe em ambiente limpo e se os fluxos críticos continuam funcionando. O roteiro é manual, repetível e serve como verificação antes de avançar para PostgreSQL/deploy web.

## 2. Pré-requisitos

- Node.js instalado.
- Dependências instaladas com `npm install` na raiz e em `frontend`.
- Backend rodando.
- Frontend rodando.
- Banco SQLite local disponível.
- Dados fictícios/teste.
- Insomnia, curl ou navegador.
- Credenciais locais de teste, por exemplo `LOGIN_ADMIN` e `SENHA_ADMIN`.

## 3. Ambiente esperado

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`
- Banco: SQLite local em `backend/academia.sqlite`
- Produção comercial real: fora de escopo.

## 4. Checklist rápido

- [ ] instalar dependências.
- [ ] subir backend.
- [ ] testar `/test-db`.
- [ ] subir frontend.
- [ ] abrir tela de login.
- [ ] realizar login.
- [ ] acessar dashboard.
- [ ] testar `/auth/me`.
- [ ] testar logout.
- [ ] testar logout-all, se aplicável.
- [ ] testar refresh backend via cookie, se possível via Insomnia/curl.
- [ ] validar que frontend usa refresh cookie com `withCredentials` no Bloco 3B.
- [ ] validar que frontend nao persiste access token em `localStorage`/`sessionStorage` no Bloco 4.
- [ ] validar CORS local em `http://localhost:5173` no Bloco 5.
- [ ] validar que origem nao autorizada e bloqueada em configuracao de producao.
- [ ] validar que cookie de refresh continua `HttpOnly`.
- [ ] validar que cookie `Secure` fica ativo em producao e desativado apenas em dev/local sem HTTPS.
- [ ] validar que producao usa HTTPS.
- [ ] validar que financeiro não aparece para perfil não autorizado.
- [ ] validar Histórico de Atividades bloqueado para perfil operacional.
- [ ] registrar pagamento.
- [ ] consultar Histórico de Atividades.
- [ ] validar acesso/liberação.
- [ ] validar Consolidado da Rede como somente leitura.
- [ ] validar bootstrap com banco limpo, quando aplicável.

## 5. Testes de backend via curl

Use `curl.exe` no PowerShell se `curl` estiver apontando para alias local.

| Teste | Comando ou ação | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| Banco SQLite | `curl http://localhost:3001/test-db` | JSON com `db_time`. | Confirma API e SQLite local. | feito |
| Login | `curl -i -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" -d "{\"login\":\"LOGIN_ADMIN\",\"senha\":\"SENHA_ADMIN\"}"` | `200`, `ok: true`, `data.token` e cookie `academia_sa_refresh`. | Use credenciais locais de teste. Não registre senha real. | feito |
| Sessão atual | `curl http://localhost:3001/auth/me -H "Authorization: Bearer TOKEN"` | `200`, `ok: true`, dados do operador autenticado. | `TOKEN` vem do login. | feito |
| Refresh backend | `curl -i -X POST http://localhost:3001/auth/refresh -H "Cookie: academia_sa_refresh=REFRESH_COOKIE"` | `200`, novo `data.token` e novo cookie de refresh. | Mais fácil validar no Insomnia, preservando cookie automaticamente. | parcial |
| Token antigo após refresh | chamar `/auth/me` com o access token anterior ao refresh. | Esperado: token antigo deixa de autenticar depois da rotação do access token. | Validar manualmente com dois tokens. | parcial |
| Logout | `curl -X POST http://localhost:3001/auth/logout -H "Authorization: Bearer TOKEN"` | `200`, sessão atual revogada e cookie limpo. | Exige bearer válido. | feito |
| Logout-all | `curl -X POST http://localhost:3001/auth/logout-all -H "Authorization: Bearer TOKEN"` | `200`, sessões ativas do usuário encerradas. | Aplicável para usuário autenticado. | feito |
| Usuário bloqueado/inativo | tentar login com usuário inativo/bloqueado. | `403` com código de usuário inativo/bloqueado. | Depende de massa de teste preparada. | parcial |

## 6. Testes de frontend

| Teste | Comando ou ação | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| Subir frontend | `cd frontend` e `npm run dev` | Vite disponível em `http://localhost:5173`. | Porta pode mudar se 5173 estiver ocupada. | feito |
| Login | abrir frontend e autenticar com usuário de teste. | Usuário entra no sistema e vê dashboard conforme perfil. | O backend continua sendo autoridade final. | feito |
| Dashboard | acessar tela inicial após login. | Dashboard carrega sem erro crítico. | Não deve expor financeiro restrito para perfil sem permissão. | parcial |
| Menus por perfil | testar navegação com perfis diferentes. | Itens aparecem/ocultam conforme UI. | Frontend apenas organiza visibilidade; validar backend separadamente. | parcial |
| Financeiro restrito | autenticar como perfil operacional e verificar menu/rota financeira. | Financeiro não deve aparecer para perfil não autorizado. | A matriz ainda tem decisões pendentes para alguns perfis. | parcial |
| Histórico restrito | autenticar como recepção/operador_acesso e tentar Histórico de Atividades. | Não deve aparecer ou deve ser bloqueado. | Histórico é somente leitura para perfis autorizados. | parcial |
| Operação básica | consultar alunos, mensalidades, produtos, vendas e acessos. | Telas principais carregam e fazem chamadas à API. | Usar dados fictícios/teste. | parcial |

## 7. Testes por perfil

| Perfil | Testes mínimos | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| `platform_admin` | onboarding, usuários internos, financeiro, consolidado, histórico. | Acesso amplo para validação/administração da plataforma. | Visibilidade financeira global em produção ainda exige decisão formal. | parcial |
| `owner` | alunos, planos, mensalidades, financeiro, consolidado, histórico escopado. | Acesso amplo no escopo da Rede/Unidade. | Não deve acessar onboarding global. | parcial |
| `admin` | operação da unidade, usuários internos, alunos, planos, financeiro se autorizado. | Acesso administrativo escopado. | Decisões finais de financeiro/unidade ainda dependem da matriz. | parcial |
| `gerente` | dashboard, alunos, produtos, vendas, planos/associações conforme UI. | Sem acesso amplo a financeiro/histórico por padrão. | Financeiro para gerente é decisão pendente. | pendente |
| `recepcao` | cadastro/consulta operacional, alunos, vendas quando autorizado. | Sem financeiro completo e sem Histórico de Atividades completo. | Pagamento por recepção é decisão pendente. | pendente |
| `operador_acesso` | consulta mínima e fluxo de acesso/liberação. | Sem financeiro, histórico, onboarding ou consolidado. | Liberação manual deve ser auditada quando usada. | parcial |

## 8. Testes de segurança de sessão

### Feito no backend

| Teste | Comando ou ação | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| Login com token opaco | `POST /auth/login` | Access token opaco retornado e hash salvo server-side. | Não é JWT. | feito |
| `/auth/me` | `GET /auth/me` com bearer. | Retorna operador autenticado. | Token ausente/inválido retorna 401. | feito |
| Logout | `POST /auth/logout` com bearer. | Sessão atual revogada. | Refresh cookie é limpo na resposta. | feito |
| Logout-all | `POST /auth/logout-all` com bearer. | Todas as sessões ativas do usuário são revogadas. | Útil após alteração sensível. | feito |
| Refresh backend | `POST /auth/refresh` com cookie `academia_sa_refresh`. | Novo access token e rotação do refresh token. | Cookie é HttpOnly, SameSite=Lax e Secure em `NODE_ENV=production`. | parcial |
| Reuso de refresh antigo | repetir refresh com cookie antigo. | `401 REFRESH_TOKEN_REUTILIZADO` e família revogada. | Validar via Insomnia/curl preservando cookies. | parcial |
| Usuário bloqueado/inativo | autenticar/operar com usuário não ativo. | Login/operação bloqueados. | Depende de massa de usuários. | feito |
| Token cru em logs/auditoria | revisar registros de `audit_log` e logs de console. | Token cru não deve aparecer; fingerprint pode aparecer. | Verificação manual. | parcial |

### Frontend Bloco 3B/3C-B/4

Nota 3C-B: o cliente central usa flags internas `_skipAuthHeader`, `_skipAuthRefresh` e `_retry`; login/refresh nao enviam bearer antigo e logout/logout-all nao tentam refresh automatico em 401.

| Teste | Comando ou ação | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| Refresh via cookie no frontend | manter sessão após expiração do access token usando cookie HttpOnly. | Frontend tenta `/auth/refresh` e salva novo bearer temporariamente. | Cookie HttpOnly não é lido via JavaScript. | feito |
| Interceptor 401 | forçar access token local inválido com refresh cookie válido. | Uma tentativa de refresh e retry da request original. | Não deve gerar loop infinito. | feito |
| Access token em memória | verificar ausencia de access token em `localStorage` e `sessionStorage`. | Token fica somente em memoria. | Chaves legadas `academia_sa_auth_token` e `academia_sa_auth_user` sao limpas/ignoradas. | feito |
| `withCredentials` no Axios | verificar envio automático de cookie cross-origin. | Cookie enviado automaticamente em login/refresh/logout e demais chamadas. | Bloco 3B configurou `withCredentials`. | feito |

### Hardening Bloco 5

| Teste | Comando ou ação | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| CORS localhost dev | acessar frontend em `http://localhost:5173` chamando API local. | Login, refresh e logout funcionam com credenciais. | Defaults dev aceitam `localhost:3000` e `localhost:5173`. | feito |
| CORS producao explicito | iniciar backend com `NODE_ENV=production` e `CORS_ORIGINS` definido. | Apenas origens configuradas recebem CORS. | Nao usar `*` com credentials. | parcial |
| Origem nao autorizada | chamar API com `Origin` fora da allowlist em producao. | Requisicao bloqueada com erro controlado. | Validar no ambiente alvo. | parcial |
| Cookie HttpOnly | login deve retornar `academia_sa_refresh` com `HttpOnly`. | Cookie nao fica acessivel via JavaScript. | Preservado do fluxo de auth. | feito |
| Cookie Secure | em `NODE_ENV=production`, cookie deve sair com `Secure`. | Em dev/local sem HTTPS, `Secure=false` permite uso local. | Configuravel por `COOKIE_SECURE` apenas fora de production. | parcial |
| Access token em storage | apos login/reload/logout, verificar `localStorage` e `sessionStorage`. | Nenhum bearer token persistido. | Bloco 4 permanece valido. | feito |
| HTTPS producao | deploy deve expor API e frontend por HTTPS. | Refresh cookie Secure funciona e browser envia cookie. | Obrigatorio antes de producao comercial. | pendente |

## 9. Testes de domínio crítico

| Domínio | Comando ou ação | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| Aluno | cadastrar e consultar aluno. | Aluno aparece na listagem/perfil. | Usar dados fictícios. | parcial |
| Mensalidade | criar/consultar mensalidade. | Status e vínculo com aluno aparecem corretamente. | Validar vencimento quando houver massa. | parcial |
| Pagamento | registrar pagamento de mensalidade. | Pagamento gravado e refletido no histórico/tela. | Deve preservar snapshot quando aplicável. | parcial |
| Venda | registrar venda de produto. | Venda gravada e produto/financeiro refletidos conforme fluxo atual. | Usar produto de teste. | parcial |
| Acesso | simular/liberar acesso. | Acesso liberado ou bloqueado conforme regra de aluno/mensalidade/status. | Endpoint de simulação usa nomenclatura mock-hikvision, mas Hikvision real é futuro. | parcial |
| Vínculo | criar/consultar vínculo responsável/dependente. | Dependente fica relacionado ao responsável. | Validar impacto em acesso. | parcial |
| Auditoria/Histórico | executar ação crítica e consultar Histórico de Atividades. | Evento aparece para perfil autorizado e permanece somente leitura. | Escopo ainda precisa validação ampla. | parcial |
| Financeiro restrito | acessar financeiro com perfis autorizados e não autorizados. | Autorizados acessam; operacionais não. | Backend deve ser a autoridade final. | parcial |
| Fechamento mensal | criar/consultar fechamento, se houver massa/fluxo disponível. | Período fechado deve restringir alterações sensíveis conforme regra. | Cobertura ainda parcial nos requisitos. | parcial |

### Casos obrigatorios de acesso sem tolerancia

| Teste | Comando ou acao | Resultado esperado | Observacao | Status |
|---|---|---|---|---|
| Aluno ativo sem mensalidade | Simular acesso via `/acessos/mock-hikvision`. | Bloqueado com motivo `sem_mensalidade_registrada` ou `sem_mensalidade_vigente`. | Nao existe tolerancia automatica. | parcial |
| POST `/acessos` sem override | Enviar `aluno_id` de aluno bloqueado para `POST /acessos` sem `liberacao_manual`. | Registro deve sair como `negado`; nunca `permitido` por payload direto. | Rota comum deve passar pela avaliacao do `AccessService`. | parcial |
| PUT `/acessos/:id` com campo critico | Tentar alterar `resultado`, `aluno_id`, `data_hora`, `motivo_bloqueio` ou status critico de registro existente. | Bloqueado com `403` e codigo `ACESSO_REGISTRO_IMUTAVEL`. | Registro de acesso e log operacional sensivel; excecao deve usar liberacao manual auditada. | parcial |
| DELETE `/acessos/:id` | Tentar apagar registro de acesso existente. | Bloqueado com `403` e codigo `ACESSO_REGISTRO_IMUTAVEL`. | Registro de acesso nao deve ser apagado fisicamente por rota comum. | parcial |
| Mensalidade vencida | Simular acesso de aluno com mensalidade vencida ou parcial vencida. | Bloqueado com motivo `mensalidade_vencida` ou `responsavel_inadimplente`. | Vencimento menor que hoje bloqueia. | parcial |
| Mensalidade em aberto no prazo | Simular acesso de aluno com vencimento futuro. | Liberado automaticamente. | Vencimento igual a hoje ainda libera. | parcial |
| Liberacao manual auditada | Simular acesso bloqueado com `liberacao_manual`, `motivo` e operador autorizado. | Permitido como manual e evento `acesso_liberado_manual` no Historico/Auditoria. | Deve registrar operador, aluno, motivo original, unidade e rede. | parcial |

Automacao local disponivel:

```cmd
tests\scripts\smoke-acesso.cmd
```

O smoke automatizado usa fixtures locais com prefixo `SMOKE_ACESSO_`, valida acesso/mensalidade sem tolerancia automatica e limpa apenas registros criados por ele. Use somente em banco local/demo; nao usar em producao.

## 10. Resultado esperado

| Teste | Comando ou ação | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| Ambiente sobe | `npm start` na raiz e `npm run dev` em `frontend`. | Backend e frontend disponíveis nas portas locais esperadas. | Scripts conferidos nos `package.json`. | feito |
| API responde | `GET /test-db`. | SQLite responde com `db_time`. | Banco local atual. | feito |
| Sessão básica | login, `/auth/me`, logout. | Fluxo de autenticação básico funciona. | Token opaco server-side. | feito |
| Refresh frontend/backend | login, capturar cookie, chamar `/auth/refresh` ou recarregar a UI com cookie valido. | Refresh rotaciona cookie e recupera access token em memoria. | Frontend Bloco 4 nao persiste bearer token em `localStorage`. | parcial |
| UI principal | login, dashboard, menus, operação básica. | Telas principais carregam sem erro crítico. | Permissões finais ainda dependem da matriz. | parcial |
| Domínio crítico | aluno, mensalidade, pagamento, venda, acesso, vínculo e auditoria. | Fluxos críticos executam com dados fictícios. | Validar por perfil antes de PostgreSQL. | parcial |

## 11. Problemas conhecidos

- O frontend concluiu o Bloco 4 de sessao com access token em memoria e refresh cookie HttpOnly com `withCredentials`.
- O frontend nao deve persistir bearer token em `localStorage` ou `sessionStorage`; chaves legadas de auth devem ser limpas/ignoradas.
- Bloco 5 adicionou hardening inicial de producao: CORS por ambiente, cookie Secure/SameSite por ambiente, headers de seguranca e documentacao de HTTPS.
- PostgreSQL ainda é futuro; SQLite é o banco atual.
- `.env.example` não deve conter segredos reais.
- O backend atual não carrega `backend/.env` automaticamente por código, pois não há dotenv configurado.
- Produção comercial real está fora de escopo.
- Permissões finais ainda dependem de congelamento da matriz.
- Alguns testes por perfil dependem de massa de usuários/perfis preparada.

## 12. Automação disponível

O smoke de autenticação backend já possui automação inicial em PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -Login admin
```

- Auth backend está automatizado parcialmente.
- Playwright possui setup mínimo em `tests/e2e/` com sanity test inicial da rota `/login`.
- API geral, frontend, carga e permissões completas ainda serão expandidos.
- Insomnia será usado para API manual/semiautomatizada. Consulte `tests/insomnia/README.md` e `tests/insomnia/requests-map.md`.
- Playwright será usado futuramente para E2E.
- k6 e JMeter serão usados futuramente para carga/performance.
