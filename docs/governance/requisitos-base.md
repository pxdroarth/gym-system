# Requisitos Base — Sistema Academia SA

## 1. Visão do produto

O Sistema Academia SA é um ERP/web app para gestão operacional e administrativa de academias. O produto centraliza a rotina de Rede, Matriz, Filiais e Unidades, com suporte a cadastro de alunos, planos, mensalidades, pagamentos, acessos, produtos, vendas, financeiro restrito, Auditoria técnica e governança multiunidade.

O sistema atual usa backend Node.js + Express, frontend React + Vite e banco SQLite. A evolução planejada prioriza PostgreSQL e deploy web antes de qualquer empacotamento desktop. Electron fica como etapa final e opcional.

O objetivo da fase final é consolidar um produto de portfólio premium, com requisitos claros, segurança de sessão, rastreabilidade, documentação versionada e arquitetura preparada para evolução SaaS. Os dados atuais do banco são fictícios/teste e não representam operação comercial real.

## 2. Escopo atual

O sistema contempla atualmente:

- Autenticação interna com token opaco server-side.
- Usuários internos e papéis operacionais.
- Governança de Rede, Unidade, Matriz e Filiais.
- Cadastro e gestão de alunos.
- Cadastro e gestão de planos.
- Mensalidades.
- Pagamentos.
- Produtos.
- Vendas de produtos.
- Financeiro restrito.
- Acessos.
- Vínculos responsável/dependente.
- Auditoria técnica e Histórico de Atividades como módulo visual somente leitura.
- Onboarding da Rede.
- Consolidado da Rede somente leitura.

## 3. Fora de escopo atual

Estão fora do escopo atual:

- Electron/build desktop.
- Billing/checkout público.
- Trial comercial.
- App mobile.
- Aluno logando em portal próprio.
- Microserviços.
- BI avançado.
- Relatórios PDF/Excel avançados.
- Produção comercial real.
- Uso de dados reais de cliente.

## 4. Atores e perfis

**platform_admin**

Responsável pela governança global da plataforma, onboarding de Redes, visão consolidada e operações administrativas de maior alcance. Deve ter visão global quando a regra de permissão permitir.

**owner**

Responsável principal por uma Rede ou operação de academia. Deve ter acesso amplo ao escopo da sua Rede/Unidades, sem assumir responsabilidades globais da plataforma.

**admin**

Perfil administrativo da academia. Atua na gestão operacional, usuários internos, alunos, planos, mensalidades, produtos, vendas, financeiro quando autorizado e Histórico de Atividades escopado.

**gerente**

Perfil gerencial da operação. No código, o equivalente técnico atual pode aparecer como `gestor`. Atua sobre rotinas de acompanhamento e gestão, respeitando permissões mais restritas que admin/owner.

**recepção**

Perfil de atendimento diário. Atua em rotinas operacionais de entrada, consulta e atendimento, sem acesso a áreas sensíveis como financeiro restrito e Histórico de Atividades completo.

**operador_acesso**

Perfil focado na operação de acesso. Deve atuar sobre liberações e verificações de entrada conforme regras de acesso e permissões específicas.

## 5. Domínios funcionais

**Autenticação e sessão**

Login interno, emissão de token opaco, sessão server-side, refresh token em cookie HttpOnly no backend, logout, logout-all, revogação administrativa e Auditoria de eventos de autenticação.

**Governança de Rede/Unidade**

Organização de Rede, Matriz, Filiais e Unidades, com escopo operacional por usuário. Internamente, `tenant` e `unit` podem continuar como termos técnicos.

**Usuários internos**

Cadastro, papéis, status e controle de acesso de operadores internos.

**Alunos**

Cadastro, consulta, status cadastral, status operacional, perfil do aluno e relacionamento com planos, mensalidades, pagamentos e acessos.

**Planos**

Cadastro e manutenção de planos oferecidos pela academia.

**Mensalidades**

Geração, consulta, status, vencimento, pagamento e regras de bloqueio ligadas a acesso.

**Pagamentos**

Registro de pagamentos e preservação histórica de informações relevantes ao momento da transação.

**Produtos e estoque**

Cadastro de produtos, imagens/uploads e controle básico associado a vendas.

**Vendas**

Registro de vendas de produtos e consulta histórica.

**Financeiro**

Módulo restrito para contas, plano de contas, dashboards financeiros, fechamento mensal e reversões controladas.

**Acessos**

Registro, simulação e avaliação de acesso conforme status do aluno, mensalidade, vínculos e regras operacionais.

**Vínculos**

Relacionamento responsável/dependente e associação de planos a alunos vinculados.

**Auditoria**

Mecanismo técnico de registro de eventos, com ator, módulo, ação, registro, antes/depois quando aplicável e metadata.

**Histórico de Atividades**

Módulo visual somente leitura que apresenta registros da Auditoria conforme permissões e escopo.

**Onboarding**

Criação e preparação inicial de Rede, Unidade e usuário principal.

**Consolidado**

Visão consolidada da Rede, somente leitura, voltada a acompanhamento e governança.

## 6. Requisitos funcionais

**RF-001 [feito]** O sistema deve permitir login de usuário interno por login/email e senha.

**RF-002 [feito]** O sistema deve emitir access token opaco bearer validado server-side.

**RF-003 [parcial]** O sistema deve emitir refresh token opaco em cookie HttpOnly no backend, mantendo compatibilidade com o bearer atual.

**RF-004 [parcial]** O sistema deve permitir renovação de sessão por `POST /auth/refresh`, com rotação de refresh token.

**RF-005 [feito]** O sistema deve permitir logout da sessão atual.

**RF-006 [feito]** O sistema deve permitir logout-all para encerrar todas as sessões ativas do usuário autenticado.

**RF-007 [feito]** O sistema deve revogar sessões de usuário quando houver alteração administrativa sensível de papel/status.

**RF-008 [feito]** O sistema deve listar e gerenciar usuários internos conforme permissões.

**RF-009 [feito]** O sistema deve cadastrar e consultar alunos.

**RF-010 [feito]** O sistema deve manter perfil do aluno com informações operacionais e históricas.

**RF-011 [feito]** O sistema deve cadastrar, consultar e atualizar planos.

**RF-012 [feito]** O sistema deve cadastrar e consultar mensalidades.

**RF-013 [feito]** O sistema deve registrar pagamentos.

**RF-014 [feito]** O sistema deve cadastrar e gerenciar produtos.

**RF-015 [feito]** O sistema deve registrar vendas de produtos.

**RF-016 [feito]** O sistema deve manter módulo financeiro restrito.

**RF-017 [feito]** O sistema deve manter plano de contas e contas financeiras.

**RF-018 [feito]** O sistema deve registrar e consultar acessos.

**RF-019 [feito]** O sistema deve avaliar acesso considerando status operacional e mensalidade.

**RF-020 [feito]** O sistema deve manter vínculos responsável/dependente.

**RF-021 [feito]** O sistema deve registrar ações relevantes na Auditoria e disponibilizá-las no Histórico de Atividades quando permitido.

**RF-022 [feito]** O sistema deve oferecer onboarding de Rede/Unidade/usuário inicial.

**RF-023 [feito]** O sistema deve oferecer Consolidado da Rede em modo somente leitura.

**RF-024 [parcial]** O sistema deve aplicar escopo de Rede/Unidade nas consultas e operações conforme permissão do usuário.

**RF-025 [feito]** O frontend deve consumir refresh token via cookie HttpOnly com `withCredentials`.

**RF-026 [feito]** O access token deve deixar de ser persistido em `localStorage` em produção.

**RF-027 [futuro]** O sistema deve operar sobre PostgreSQL em ambiente de deploy web.

**RF-028 [futuro]** O sistema pode ser empacotado em Electron em etapa opcional posterior.

## 7. Regras de negócio

**RN-001 [feito]** Mensalidade vencida deve bloquear acesso automaticamente; não existe tolerância automática para inadimplência.

**RN-002 [feito]** No dia do vencimento, o acesso ainda deve ser permitido quando a mensalidade ainda não está vencida. Para planos mensais manuais (GS-07), substituída pela decisão D5: sem cobertura quitada, o acesso é bloqueado também no dia do vencimento.

**RN-003 [feito]** Pagamento deve preservar snapshot histórico suficiente para não depender apenas do estado atual de plano, mensalidade ou aluno.

**RN-004 [parcial]** Fechamento mensal deve bloquear alterações diretas do período fechado; a cobertura ainda precisa ser validada em todas as operações sensíveis.

**RN-005 [parcial]** Reversão controlada deve substituir exclusão direta em fluxos financeiros sensíveis; ainda é necessário confirmar que não restam caminhos de exclusão direta indevidos.

**RN-006 [feito]** Financeiro não deve aparecer na dashboard comum como área aberta a todos os perfis.

**RN-007 [feito]** Consolidado da Rede deve ser somente leitura.

**RN-008 [feito]** Histórico de Atividades não pode permitir edição ou exclusão de registros de Auditoria pela interface operacional.

**RN-009 [feito]** Usuário inativo ou bloqueado não deve autenticar.

**RN-010 [feito]** Usuário inativo ou bloqueado não deve executar ações protegidas.

**RN-011 [feito]** Alteração de papel/status deve provocar revogação de sessões do usuário afetado.

**RN-012 [parcial]** Escopo de Unidade deve limitar operações conforme as unidades permitidas para o usuário.

**RN-013 [pendente]** Matriz completa de permissões deve ser congelada antes da migração para PostgreSQL.

**RN-014 [feito]** Aluno sem mensalidade registrada/vigente deve ser bloqueado automaticamente; a única exceção operacional é liberação manual autorizada e auditada.

## 8. Requisitos de segurança

**RS-001 [feito]** O sistema deve usar token opaco server-side, não JWT.

**RS-002 [feito]** Token cru não deve ser salvo em banco, log ou Auditoria.

**RS-003 [parcial]** Refresh token deve ser enviado em cookie HttpOnly.

**RS-004 [parcial]** Refresh token deve ser rotacionado a cada uso.

**RS-005 [parcial]** Reuso de refresh token antigo deve revogar a família de refresh tokens.

**RS-006 [feito]** Logout deve revogar a sessão atual.

**RS-007 [feito]** Logout-all deve revogar todas as sessões do usuário.

**RS-008 [feito]** Alteração de papel/status deve revogar sessões do usuário afetado.

**RS-009 [feito]** Usuário bloqueado/inativo deve ser impedido de autenticar e operar.

**RS-010 [feito]** CORS deve permitir credenciais sem usar origin `*`, preservando localhost.

**RS-011 [parcial]** CSP deve ser configurada para reduzir risco de XSS.

**RS-012 [pendente]** Produção não deve persistir access token em `localStorage`.

**RS-013 [parcial]** Frontend deve usar refresh cookie com `withCredentials` e access token em memória.

**RS-014 [parcial]** Deploy de produção deve usar HTTPS obrigatório para cookie `Secure`.

## 9. Requisitos de auditoria

**RA-001 [feito]** Auditoria deve registrar eventos técnicos e operacionais relevantes.

**RA-002 [feito]** Histórico de Atividades deve apresentar registros de Auditoria em modo somente leitura.

**RA-003 [feito]** Auditoria deve registrar ator, módulo, ação, tipo de registro, id de registro e data.

**RA-004 [feito]** Auditoria deve registrar antes/depois quando aplicável.

**RA-005 [feito]** Auditoria deve permitir metadata para contexto técnico e operacional.

**RA-006 [parcial]** Histórico de Atividades deve respeitar escopo por Rede/Unidade.

**RA-007 [feito]** `platform_admin` deve ter visão global quando autorizado.

**RA-008 [parcial]** `owner` e `admin` devem ter visão escopada ao seu contexto operacional.

**RA-009 [feito]** Operador/recepção não devem ter acesso ao Histórico de Atividades completo.

**RA-010 [feito]** Eventos de login/logout devem ser auditados.

**RA-011 [feito]** Token inválido/revogado deve ser auditado sem salvar token cru.

**RA-012 [feito]** Refresh bem-sucedido deve auditar `auth_refresh`.

**RA-013 [feito]** Reuso de refresh antigo deve auditar `auth_refresh_reuse_detected`.

**RA-014 [pendente]** Auditoria B1/B2/B3 deve ser revisada e congelada antes do PostgreSQL.

## 10. Requisitos de dados

**RD-001 [feito]** O banco atual deve ser SQLite.

**RD-002 [futuro]** O banco alvo para evolução web/SaaS deve ser PostgreSQL.

**RD-003 [feito]** Dados atuais devem ser tratados como fictícios/teste.

**RD-004 [feito]** Regras de negócio devem prevalecer sobre dados de teste existentes.

**RD-005 [parcial]** Pagamentos e registros financeiros/vendas devem preservar snapshots históricos quando aplicável; a cobertura ainda precisa ser validada em todos os domínios financeiros, vendas e pagamentos.

**RD-006 [feito]** A tabela `auth_session` deve representar sessões/access tokens server-side.

**RD-007 [parcial]** A tabela `auth_refresh_token` deve representar refresh tokens opacos por hash.

**RD-008 [feito]** A tabela `audit_log` deve armazenar registros técnicos de Auditoria.

**RD-009 [feito]** `tenant` representa tecnicamente a Rede.

**RD-010 [feito]** `unit` representa tecnicamente a Unidade, Matriz ou Filial.

**RD-011 [feito]** `usuario_interno` deve armazenar usuários internos e seus papéis/status.

**RD-012 [feito]** O sistema deve manter dados de alunos.

**RD-013 [feito]** O sistema deve manter dados de mensalidades.

**RD-014 [feito]** O sistema deve manter dados de pagamentos.

**RD-015 [feito]** O sistema deve manter dados financeiros.

**RD-016 [pendente]** Antes do PostgreSQL, o schema deve passar por congelamento e revisão de nomes, índices e constraints.

**RD-017 [pendente — bloqueante antes do piloto multiunidade]** O aluno deve ter cadastro e matrícula únicos por Rede; o plano define as Unidades autorizadas e cada entrada é registrada na Unidade onde aconteceu. Detalhe e aceite na pendência GS-02 (seção 14). Até lá, a matrícula é única por Unidade (`UNIQUE(tenant_id, unit_id, matricula)`), por compatibilidade com o código atual (GS-01).

## 11. Requisitos não funcionais

**RNF-001 [parcial]** O sistema deve priorizar segurança de sessão e proteção contra roubo de token.

**RNF-002 [feito]** O sistema deve manter rastreabilidade por Auditoria e Histórico de Atividades.

**RNF-003 [parcial]** A arquitetura deve ser clara e fácil de evoluir.

**RNF-004 [parcial]** O código deve ser manutenível e evitar refactors amplos sem necessidade.

**RNF-005 [pendente]** O sistema deve estar preparado para PostgreSQL antes de deploy web.

**RNF-006 [parcial]** O sistema deve estar preparado para deploy web com configuração segura.

**RNF-007 [parcial]** A interface deve ter responsividade razoável para uso administrativo.

**RNF-008 [parcial]** A performance deve ser suficiente para academia com centenas de alunos.

**RNF-009 [feito]** Documentação deve ser versionada no repositório.

**RNF-010 [pendente]** Smoke tests devem ser documentados e repetíveis.

## 12. Requisitos de integração

**RI-001 [futuro]** O sistema deve prever integração futura com catraca/câmera.

**RI-002 [futuro]** O sistema deve prever backup/cloud em ambiente de produção.

**RI-003 [futuro]** Uploads devem poder migrar para storage externo.

**RI-004 [futuro]** O sistema deve suportar deploy web.

**RI-005 [futuro]** O sistema deve migrar para PostgreSQL.

**RI-006 [futuro]** Jobs externos podem ser considerados para rotinas recorrentes, sincronizações e manutenção.

## 13. Requisitos de teste

**RT-001 [pendente]** Deve existir roteiro de smoke tests manuais.

**RT-002 [pendente]** Testes devem cobrir os principais perfis: platform_admin, owner, admin, gerente, recepção e operador_acesso.

**RT-003 [parcial]** Testes de sessão devem cobrir login, `/auth/me`, logout, logout-all, refresh e reuso de refresh.

**RT-004 [pendente]** Testes de Auditoria e Histórico de Atividades devem validar escopo, leitura e eventos críticos.

**RT-005 [pendente]** Testes devem validar que financeiro é restrito por perfil.

**RT-006 [pendente]** Testes devem validar mensalidade, pagamento e snapshot histórico.

**RT-007 [pendente]** Testes devem validar regras de acesso por cobertura paga vigente, pagamento, vínculo/plano, bloqueio de `em_aberto`/`parcial` e override manual auditado.

**RT-008 [futuro]** Playwright deve ser considerado para fluxos críticos de UI.

## 14. Pendências antes do PostgreSQL

- Validar Bloco 3B de segurança de sessão no frontend em smoke manual amplo.
- Validar Bloco 4 em ambiente de deploy: access token em memória e ausência de persistência em `localStorage`/`sessionStorage`.
- Validar Bloco 5 no ambiente real: HTTPS, proxy, CORS final, CSP do frontend e política final de cookies.
- Congelar matriz de permissões final.
- Revisar Auditoria B1/B2/B3 e sua apresentação no Histórico de Atividades.
- Consolidar helper global de erro e formato padrão de resposta.
- Executar e documentar smoke test geral.
- Fazer schema freeze antes de migrations.
- Revisar nomes técnicos para migração PostgreSQL.
- Estratégia de seed/bootstrap para ambiente limpo: feita na GS-01 (`ensureSchema` cria as tabelas de negócio; `npm run db:seed:dev` gera base sintética reproduzível).
- GS-02 — cadastro e matrícula únicos por Rede (bloqueante antes do piloto multiunidade; ver abaixo).
- GS-03 — Identidade e Acesso, lote 1: feito (ver abaixo).
- GS-04, GS-05, GS-06 — próximos lotes de Identidade e Acesso (ver abaixo).

### GS-02 — Cadastro e matrícula únicos por Rede

**Status:** pendente. **Obrigatória antes do piloto multiunidade.** Fora do escopo da GS-01.

**Contexto:** hoje cada Unidade tem cadastro e matrícula próprios (`aluno.unit_id`, matrícula calculada por `MAX(matricula)` por tenant/unit em `backend/routes/alunos.js`). Um aluno que frequenta duas Unidades precisa de dois cadastros.

**Escopo:**

- Um único cadastro e uma única matrícula do aluno por Rede (tenant).
- O plano define as Unidades autorizadas.
- A decisão de acesso considera a Unidade onde a tentativa acontece e as Unidades autorizadas pelo plano.
- Cada entrada é registrada na Unidade onde aconteceu (`acesso.unit_id` = Unidade do dispositivo/recepção), não na Unidade de cadastro.
- Plano de migração para bases existentes com alunos duplicados entre Unidades.
- ~~Revisar `ensureExistingUserScopes`~~: resolvido na GS-03 (vínculos automáticos com a Matriz removidos; ver `vinculos-escopo-legado.md`).

**Critério de aceite:** um aluno com um único cadastro e uma única matrícula consegue entrar nas Unidades liberadas pelo plano e recebe acesso negado em uma Unidade fora do plano; cada entrada aparece registrada na Unidade onde aconteceu.

### GS-03 — Identidade e Acesso, lote 1 (feito)

- Tela e API de Usuários respeitam Rede e unidades gerenciáveis; papel, status e unidades autorizadas são validados no servidor e auditados (regras em `matriz-permissoes.md`, seção 7.1).
- Removidos os vínculos automáticos com a Matriz no bootstrap, login, resolução de sessão, refresh e criação de usuário; `usuario_unit.origem` registra a origem de cada vínculo novo.
- Vínculos antigos de origem não confirmada: procedimento em `vinculos-escopo-legado.md` e diagnóstico `tests/scripts/diagnostico-vinculos.js`.
- Validação: `tests/scripts/smoke-identidade.js` (Matriz → Filial, Filial → Matriz, Rede A → Rede B, hierarquia, bloqueio de promoção a `platform_admin`), repetido após reinício da API e refresh de sessão.

### Próximos lotes de Identidade e Acesso

**GS-04 — Minha conta [pendente].** Tela e API para o próprio usuário ver seus dados, Rede/unidades autorizadas e trocar a própria senha (exigindo a senha atual), sem alterar papel, status ou unidades. Aceite: troca de senha revoga as demais sessões e é auditada; tentativa de alterar papel/unidades pela própria conta é recusada.

**GS-05 — Gerenciamento de sessões [pendente].** Listar sessões ativas do próprio usuário (dispositivo, IP, último uso), encerrar uma sessão específica e, para owner/admin no seu escopo, encerrar sessões de um usuário gerenciado. Aceite: sessão encerrada falha no próximo request e no refresh; ações auditadas; admin não vê sessões fora do seu escopo.

**GS-06 — Recuperação de senha [pendente].** Fluxo de "esqueci minha senha" com token de uso único, expiração curta, armazenamento por hash, resposta neutra (não revela se o login existe) e limite de tentativas; redefinição revoga todas as sessões. Depende de decisão sobre canal de envio (e-mail) e de gestão de segredos. Aceite: token reutilizado ou expirado é recusado; nenhuma resposta permite enumerar usuários.

### GS-07 — Planos e Mensalidades (mensal manual)

Diagnóstico e plano completos no documento da GS-07 (commit analisado: `bd74c2d`).

**F0 limitada (P2, P9, P10) — feita na branch `gs-07-f0-acesso-datas`:**

- P2: uma mensalidade futura em aberto não esconde mais a cobertura paga vigente. Quando a mensalidade tem período de cobertura, só ele decide se ela vale hoje; registros legados sem datas mantêm a regra antiga. Débito vencido continua bloqueando (RN-001).
- P9: o acesso usa a data local da operação (`APP_TIMEZONE`, padrão `America/Sao_Paulo`), não a data UTC.
- P10: editar uma mensalidade só altera cobertura e observações quando esses campos vêm no pedido.
- Validação: `tests/scripts/smoke-f0-acesso-datas.js`.

**P1 — pagamentos parciais e estorno por pagamento — feito na branch `gs-07-p1-pagamentos-parciais` (empilhada sobre a F0):**

- Cada pagamento é um registro próprio. A mensalidade fica `parcial` enquanto a soma dos pagamentos válidos (não estornados) for menor que o valor cobrado, e `pago` quando alcança o valor (D6).
- Pagamento acima do saldo em aberto é recusado (`422 PAGAMENTO_ACIMA_DO_SALDO`); mensalidade quitada recusa novo pagamento (`409 MENSALIDADE_QUITADA`). O saldo é comparado em centavos, na mesma transação que grava o pagamento; valores com mais de duas casas decimais são recusados.
- Idempotência: header `Idempotency-Key` (ou campo `chave_idempotencia`), única por Rede/Unidade. Mesma chave com os mesmos dados devolve o resultado original (`200`, header `Idempotent-Replayed: true`) sem gravar pagamento, lançamento ou auditoria, inclusive com saldo zerado ou pagamento já estornado. Mesma chave com dados diferentes: `409 IDEMPOTENCIA_CONFLITO`. Sem chave, cada envio é um pagamento novo.
- Estorno: `POST /pagamentos/:id/estornar` com `motivo`, exige `reversao:executar`, valida Rede/Unidade (pagamento de outra unidade: `404`) e o fechamento do período do pagamento e da data do estorno. Estorna só o pagamento escolhido, mantém vencimento e período de cobertura e recalcula o status pelo saldo restante (D7). Registra `reversao_controlada`, lançamento inverso e auditoria `estornar_pagamento_mensalidade`.
- Financeiro: cada pagamento novo gera o próprio lançamento (`origem = 'pagamento_mensalidade'`) na data do pagamento, para que um pagamento posterior não altere lançamento de mês já fechado. Lançamentos legados (`origem = 'mensalidade'`) são preservados; a sincronização não soma de novo o que já tem lançamento próprio, e o "a receber" agregado é baixado quando a mensalidade passa a ter pagamentos no modelo novo.
- A reversão em bloco (`/reversoes/mensalidades/:id`) continua para mensalidades legadas; com pagamentos no modelo novo, responde `409 USAR_ESTORNO_POR_PAGAMENTO`.
- As transações do processo passaram a ser serializadas (fila em `dbHelper.runTransaction`): com uma única conexão SQLite, requisições simultâneas falhavam com "cannot start a transaction within a transaction".
- Validação: `tests/scripts/smoke-p1-pagamentos.js`.

**P1.1 — idempotência na tela e isolamento de transação — feito na branch `gs-07-p1-1-idempotencia-isolamento` (a partir de `ec335b2`):**

- Perfil do aluno: cada tentativa de pagamento recebe uma `Idempotency-Key`. Depois de timeout (15 s, `VITE_PAGAMENTO_TIMEOUT_MS`), falha de rede ou erro 5xx, a tentativa fica guardada na sessão do navegador e o botão vira "Reenviar pagamento", que repete o mesmo pedido com a mesma chave. A tentativa é descartada quando o servidor responde 2xx ou 4xx. O botão fica desabilitado durante a requisição e uma trava síncrona impede o clique duplo. Mensalidades `parcial` passam a ter o botão "Pagar saldo".
- CORS aceita o header `Idempotency-Key` e expõe `Idempotent-Replayed`.
- Transações usam uma conexão SQLite dedicada. Gravações de outras requisições vão pela conexão principal: esperam a trava e não são desfeitas pelo rollback da transação. Dentro da transação, as funções globais do `dbHelper` continuam usando a conexão dela; trabalho agendado que roda depois do commit volta para a conexão principal.
- `ToastNotification` deixou de repetir o aviso a cada re-render da página.
- Validação: `tests/scripts/smoke-isolamento-transacao.js` (11/11; o mesmo teste falha em 4 itens no `ec335b2`) e `tests/scripts/ui-p1-1-pagamento.py` (clique duplo, falha de rede e timeout pela tela: um pagamento e um lançamento em cada caso).
- Limite conhecido: no SQLite as gravações continuam serializadas pela trava do arquivo; uma transação mais longa que `SQLITE_BUSY_TIMEOUT_MS` (padrão 5 s) faz a gravação concorrente falhar com `SQLITE_BUSY`. O PostgreSQL resolve com pool de conexões.

**Lote separado:** P11 (fechamento e KPIs pela data correta, incluindo receita líquida de estornos) segue em lote próprio.

**Decisões registradas para o mensal manual:**

- **D1 — Ciclo:** do vencimento até a véspera do próximo vencimento. Em mês curto, o vencimento cai no último dia e a âncora original (29, 30 ou 31) é preservada nos meses seguintes.
- **D2 — Adesão:** por plano, com prévia por aluno. Períodos já pagos são preservados e qualquer intervalo de transição é mostrado antes da ativação.
- **D3 — Primeira matrícula fora do vencimento:** cobrança proporcional até a véspera do próximo ciclo, calculada em centavos com a quantidade real de dias do ciclo.
- **D5 — Tolerância zero:** se a cobertura anterior acabou e o novo ciclo ainda não foi quitado, o acesso fica bloqueado, inclusive no dia do vencimento. Para planos mensais manuais, esta decisão substitui RN-002.
- **D6 — Pagamento parcial:** somam-se os pagamentos válidos da mesma mensalidade; o parcial não libera a cobertura daquele ciclo até completar o valor.
- **D7 — Estorno:** estorna-se o pagamento específico, preserva-se a competência e a situação é recalculada pelo saldo dos pagamentos restantes. Se a quitação deixar de existir, o saldo daquele ciclo é reaberto.
- Pendentes: D4 (troca do dia de vencimento), D8 (geração das mensalidades), D9 (trimestral/semestral), D10 (limite de competências adiantadas), D11 (fuso por Rede/unidade) e D12 (planos compartilhados).

### DN-3 — Permissões operacionais do L02

Decisões aprovadas em 10/11/2026 para o piloto. Caixa e recepção usam o papel existente `recepcao`. Gerente usa `gestor`. Cada ação operacional aplica o vínculo ativo e o escopo da unidade no servidor.

| Decisão aprovada | Entrega e dependência |
| --- | --- |
| Financeiro confere o fechamento. Dono e admin autorizado fecham a unidade. Só o dono reabre com motivo e auditoria na operação da academia. | API implementada. Novos controles de interface dependem do L04. A política do suporte master tem sublote próprio. |
| Gestor solicita estorno com motivo, dono ou admin da unidade aprova e financeiro executa. Cada etapa identifica a conta individual e referencia a operação original. | L02 bloqueia execução direta nas rotas canônicas, aliases e exclusão de conta paga. O sublote de aprovação depende de persistência dos estados e atores, aprovação consumida uma vez, transação de execução e telas. Aceite inclui recusa de execução sem aprovação, autorização fora do escopo, repetição e estorno de um só pagamento, preservando competência e saldo dos demais. |
| Recepção cadastra aluno, escolhe plano aprovado, gera primeira cobrança padrão e recebe. Pode emitir cobrança padrão de plano mensal ativo se não houver cobrança correspondente. Gestor também recebe. | API e telas existentes. O servidor calcula D1 e D3 no fuso da operação, serializa a emissão e preserva D5/D6 e a idempotência do recebimento. L03 valida renovação e transições de cobertura, inclusive pacote e sobreposição com legado. |
| Recepção corrige dados básicos. Mudança posterior de plano, vencimento, status ou vínculo exige permissão específica. | API e formulário implementados. Os valores reenviados sem mudança efetiva são aceitos em edição básica. |
| Gestor, financeiro, admin autorizado e dono concedem desconto excepcional no escopo com motivo. Caixa pode solicitar uma exceção. | API e perfil do aluno implementam desconto sobre cobrança aberta sem pagamentos, com valor residual positivo. O sublote de solicitação deve vincular cobrança, solicitante, motivo, decisão e responsável. Aceite inclui caixa solicitando, recusa de concessão direta pelo caixa e trilha completa. |
| Gestor ou financeiro prepara campanha. Dono ou admin autorizado aprova a publicação. Caixa aplica campanha publicada e elegível. | Sublote de campanhas após política de desconto, com estados de preparação e publicação, elegibilidade validada pelo servidor e auditoria. Aceite inclui impedir publicação pelo caixa e aplicação de condição não aprovada ou inelegível. |
| Suporte autorizado configura e publica campanha conforme instrução do cliente. Autorização externa pode vir por WhatsApp e identifica autorizador e condições. | Depende de campanhas e dos controles de suporte. Aceite exige identificar autorização como externa, registrar executor separado e verificar o escopo do cliente. |
| Admin da Filial vê valores das unidades autorizadas. Consolidado integral exige alcance da Rede. | Relatório implementado. L02 concede o alcance integral ao dono pelo papel. Atribuição explícita a admin exige mecanismo posterior de concessão por Rede. |
| Catálogo compartilhado exige permissão de Rede. Planos exclusivos exigem permissão de catálogo na unidade que pode comercializá-los. | L02 concede escrita no compartilhado ao dono. L08 trata planos locais e sua distribuição, com autorização por unidade comercial. Unidades onde o aluno pode treinar pertencem às regras de acesso multiunidade GS-02, L08–L09. Aceite distingue comercialização de entrada e cobre escopo e legado. |
| Categorias compartilhadas do plano de contas são administradas pelo dono ou admin com permissão financeira da Rede. | L02 autoriza o dono e mantém leitura para os papéis financeiros existentes. Admin fica sem escrita até a concessão financeira de Rede estar disponível. |
| Admin autorizado desativa vínculo da sua unidade. Dono desativa na própria Rede conforme hierarquia, preservando vínculos de outras Redes. | API e Usuários implementados. Desativa o vínculo da unidade selecionada, mantém conta e outros vínculos e revoga sessões para novo login. |
| Administrador master atua em empresas e unidades para finalidades de suporte definidas, com contexto explícito, executor, motivo e eventual autorização do cliente. | Sublote de suporte antes da publicação, dependente de definição de finalidades e escopo. Aceite inclui contexto obrigatório, atribuição do ator, autorização externa identificada como tal, proteção de dados de outras Redes e validações financeiras existentes. Contratos comerciais personalizados ficam fora do escopo. |

## 15. Critérios de aceite do produto

O produto pode ser considerado pronto para PostgreSQL/deploy de portfólio quando:

- Login, logout, logout-all, refresh e `/auth/me` funcionam conforme critério de segurança definido.
- Access token cru não é salvo em banco, log ou Auditoria.
- Refresh token opera por cookie HttpOnly com rotação.
- Matriz de permissões está documentada, revisada e validada por perfil.
- Segurança de sessão frontend/produção está concluída ou documentada como pendência bloqueante antes de produção comercial.
- Frontend não depende de token persistente em `localStorage` em modo de produção, ou essa dependência está formalmente bloqueada para produção.
- Financeiro permanece restrito por perfil.
- Consolidado da Rede permanece somente leitura.
- Histórico de Atividades permanece somente leitura e escopado.
- Regras de mensalidade, pagamento, fechamento, reversão e acesso estão testadas ou listadas como pendência antes do deploy.
- Smoke test geral foi executado e documentado antes de PostgreSQL/deploy.
- Schema foi congelado para migração.
- Dados fictícios/teste foram separados de qualquer dado real.
- Deploy web tem configuração mínima segura para CORS, cookies, HTTPS e variáveis de ambiente.
