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

**RN-002 [feito]** No dia do vencimento, o acesso ainda deve ser permitido quando a mensalidade ainda não está vencida.

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

**RT-007 [pendente]** Testes devem validar regras de acesso por mensalidade/status/vínculo.

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
- Definir estratégia de seed/bootstrap para ambiente limpo.

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
