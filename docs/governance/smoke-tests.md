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
- [ ] validar que frontend ainda depende de `localStorage` até Bloco 3B/4.
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

### Pendente no frontend Bloco 3B/4

| Teste | Comando ou ação | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| Refresh via cookie no frontend | manter sessão após expiração do access token usando cookie HttpOnly. | Ainda pendente. | `authService.js` não chama `/auth/refresh` hoje. | pendente |
| Access token em memória | verificar ausência de access token em `localStorage`. | Ainda pendente. | `authStorage.js` persiste `academia_sa_auth_token` em `localStorage`. | pendente |
| `withCredentials` no Axios | verificar envio automático de cookie cross-origin. | Ainda pendente. | Instância Axios atual não define `withCredentials`. | pendente |

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

## 10. Resultado esperado

| Teste | Comando ou ação | Resultado esperado | Observação | Status |
|---|---|---|---|---|
| Ambiente sobe | `npm start` na raiz e `npm run dev` em `frontend`. | Backend e frontend disponíveis nas portas locais esperadas. | Scripts conferidos nos `package.json`. | feito |
| API responde | `GET /test-db`. | SQLite responde com `db_time`. | Banco local atual. | feito |
| Sessão básica | login, `/auth/me`, logout. | Fluxo de autenticação básico funciona. | Token opaco server-side. | feito |
| Refresh backend | login, capturar cookie, chamar `/auth/refresh`. | Refresh rotaciona cookie e access token. | Backend implementado; frontend ainda pendente. | parcial |
| UI principal | login, dashboard, menus, operação básica. | Telas principais carregam sem erro crítico. | Permissões finais ainda dependem da matriz. | parcial |
| Domínio crítico | aluno, mensalidade, pagamento, venda, acesso, vínculo e auditoria. | Fluxos críticos executam com dados fictícios. | Validar por perfil antes de PostgreSQL. | parcial |

## 11. Problemas conhecidos

- O frontend ainda não concluiu Bloco 3B/4 de sessão.
- O frontend ainda persiste access token em `localStorage` no estado atual.
- O frontend ainda não usa refresh cookie com `withCredentials` na instância Axios atual.
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
- API geral, frontend, carga e permissões completas ainda serão expandidos.
- Insomnia será usado para API manual/semiautomatizada. Consulte `tests/insomnia/README.md` e `tests/insomnia/requests-map.md`.
- Playwright será usado futuramente para E2E.
- k6 e JMeter serão usados futuramente para carga/performance.
