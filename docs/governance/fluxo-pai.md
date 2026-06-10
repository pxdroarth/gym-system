# Fluxo Pai — Sistema Academia SA

## Visão macro

O projeto deve ser tratado como:

```txt
ERP SaaS multi-tenant
+
plataforma modular de acesso físico
+
gateway local de integração
+
observabilidade operacional
+
automação assistida por IA
```

O fluxo pai é o backlog macro total do produto, cobrindo:

- produto
- arquitetura
- governança
- segurança
- testes
- DevOps
- observabilidade
- hardware
- biometria/facial
- gateway local
- IA
- operação solo

---

# STATUS GERAL ATUAL

O projeto saiu de:

```txt
CRUD acadêmico/local
```

e entrou em:

```txt
SaaS ERP arquitetado profissionalmente
```

Hoje o sistema já possui:

- arquitetura modular
- auth madura
- refresh seguro
- token em memória
- hardening inicial
- auditoria crítica
- domínio financeiro
- domínio de acesso
- smoke tests
- multi-tenant inicial
- governança/documentação
- separação de infraestrutura HTTP
- preparação para DevOps
- preparação para hardware/catraca

## Estado arquitetural atual

- monólito modular pragmático
- evitar microservices ou event-driven prematuros
- frontend React + Vite + Tailwind
- backend Node.js + Express
- SQLite local como banco atual
- migração gradual futura para PostgreSQL
- Electron/gateway local previsto para operação offline e integração com dispositivos

## Prioridades arquiteturais atuais

- segurança
- estabilidade
- governança
- testes
- auditabilidade
- reversibilidade
- baixo acoplamento
- diffs pequenos

## Auth e RBAC atuais

- auth com token opaco server-side e refresh cookie HttpOnly
- access token apenas em memória
- logout e logout-all implementados
- RBAC aplicado no backend e no frontend
- permissões críticas preservadas
- fallback legado `x-operator-id` ou `x-user-id` restrito a testes e uso opt-in

## Fluxos canônicos atuais

- pagamento: `POST /pagamentos`
- contratação ou renovação: `POST /planos/contratar-renovar`
- dashboard financeiro: `GET /dashboard/financeiro/kpis`
- contas financeiras manuais: `/contas-financeiras`
- diagnóstico operacional: `tests/scripts/diagnostico-consistencia.cmd`

## Fluxo operacional Codex ou IA atual

- Codex deve editar o mínimo necessário
- o usuário roda as validações locais principais
- o assistente revisa output, diff e riscos
- não instalar dependências pesadas sem confirmação
- `smoke-auth` pode exigir interação e não deve ser disparado no Codex sem cuidado
- preferir GPT-5.4 médio ou alto para diagnóstico, documentação e remoções simples
- usar GPT-5.5 alto ou altíssimo apenas em auth, RBAC, financeiro transacional, pagamentos, cobertura, acesso, schema, migration, scheduler com efeito operacional ou reconciliação automática
- se o modelo ou nível de esforço parecer subdimensionado, registrar a limitação e recomendar refazer

---

# FASE 1 — BASE DO ERP

## STATUS
✅ CONCLUÍDA

## Incluiu

- alunos
- planos
- mensalidades
- pagamentos
- produtos
- vendas
- dashboard
- multi-unidade inicial
- permissões iniciais
- biometria mock
- financeiro base

---

# FASE 2 — GOVERNANÇA E HARDENING ARQUITETURAL

## STATUS
✅ CONCLUÍDA

## Incluiu

- documentação técnica
- smoke tests
- requisitos-base
- padronização
- auditoria seletiva
- regras críticas
- revisão de bypass
- imutabilidade operacional
- política de logs
- modularização frontend
- separação Api.js/services

---

# FASE 3 — SEGURANÇA DE SESSÃO E AUTH

## STATUS
✅ CONCLUÍDA

## Incluiu

- refresh token HttpOnly
- access token em memória
- token opaco server-side
- limpeza de localStorage/sessionStorage
- interceptor central
- refresh single-flight
- logout/logout-all
- cookies seguros
- CORS
- CSP parcial
- security headers
- smoke-auth
- smoke-acesso

---

# FASE 4 — ESTABILIZAÇÃO PROFISSIONAL

## STATUS
🔄 ATUAL

## Posição atual

```txt
CHECKPOINT 5.1 — AUTH LOCAL / SMOKE GATE (CONCLUÍDO)
```

Gate principal atual:

```txt
tests\scripts\smoke-auth.cmd
tests\scripts\smoke-acesso.cmd
npm.cmd --prefix frontend run build
```

Playwright/E2E permanece criado apenas como infraestrutura experimental e será retomado em fase futura de maturidade/CI.

---

# CHECKPOINT 5.1 — AUTH LOCAL / SMOKE GATE

## STATUS
✅ CONCLUÍDO

## Objetivo

Garantir que o ambiente local tenha credencial admin válida e que o `smoke-auth` volte a passar sem alterar a arquitetura de autenticação.

## Escopo

- validar credencial admin atual
- corrigir estado local do SQLite, se necessário
- criar ou ajustar script seguro de reset/bootstrap admin, se necessário
- documentar procedimento local
- rodar smoke-auth
- rodar smoke-acesso
- confirmar que não houve retorno de bearer em localStorage/sessionStorage

## Fora de escopo

- mudar fluxo de auth
- trocar token opaco
- alterar refresh
- mexer em cookies
- alterar RBAC
- mexer em permissões
- iniciar Playwright

## Validações

```bash
tests\scripts\smoke-auth.cmd
tests\scripts\smoke-acesso.cmd
npm.cmd --prefix frontend run build
```

---

# BLOCO 6 — PLAYWRIGHT / MCP / E2E

## STATUS
⏸️ PAUSADO PARA FASE FUTURA DE MATURIDADE/CI

## Objetivo

Manter a infraestrutura inicial de E2E criada, sem torná-la gate principal nesta fase.

## BLOCO 6A — SETUP PLAYWRIGHT

### Status

- criado
- manter como infraestrutura experimental

### Inclui

- instalar `@playwright/test`
- configurar `playwright.config`
- estruturar testes E2E
- habilitar traces/screenshots
- criar helpers de auth
- criar base de fixtures

### Estrutura prevista

```txt
tests/
  e2e/
  playwright/
  fixtures/
  screenshots/
  traces/
```

## BLOCO 6B — E2E AUTH

### Status

- criado
- não é gate principal nesta fase

### Fluxos

- login
- refresh
- reload mantendo sessão
- logout
- logout-all
- cookie HttpOnly
- storage vazio
- sessão inválida

## BLOCO 6C — E2E PERMISSÕES

### Status

- pausado
- futuro

### Fluxos

- financeiro restrito
- auditoria restrita
- ocultação de cards
- permissões visuais
- multi-unidade
- escopo operacional

## BLOCO 6D — E2E ACESSO

### Status

- pausado
- futuro

### Fluxos

- aluno bloqueado
- aluno liberado
- override manual
- auditoria visual
- validação operacional

## BLOCO 6E — MCP

### Objetivo

Permitir automação assistida por agente:

- navegação automática
- inspeção de telas
- geração assistida de testes
- validação operacional
- automação futura

### Observação de governança

- O gate principal atual voltou a ser:
  - `tests\scripts\smoke-auth.cmd`
  - `tests\scripts\smoke-acesso.cmd`
  - `npm.cmd --prefix frontend run build`
- A expansão de E2E/Playwright será retomada em fase futura de maturidade/CI.

---

# FASE 5 — MATURIDADE SaaS

## STATUS
⏳ FUTURA

## Inclui

### RBAC definitivo

- permissões refinadas
- escopos
- perfis

### Banco

- revisão estrutural
- constraints
- índices
- integridade

### PostgreSQL

- migração SQLite → PostgreSQL
- migrations
- seeds
- ambiente demo
- plano de rollback
- estratégia de backup

---

# FASE 6 — DEVOPS REAL

## STATUS
⏳ FUTURA

## Objetivo

Transformar o projeto em sistema operável em produção.

## Inclui

- Docker
- docker-compose
- nginx
- HTTPS
- reverse proxy
- GitHub Actions
- CI/CD
- PM2/systemd
- backups
- logs
- observabilidade
- deploy Linux

## BLOCO 6F — STAGING HTTPS

### Objetivo

Criar ambiente realista antes de produção comercial.

### Inclui

- domínio/subdomínio frontend
- domínio/subdomínio API
- HTTPS
- reverse proxy
- CORS real
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE` adequado
- `VITE_API_URL` real
- validação no navegador

### Validações

- smoke-auth
- smoke-acesso
- login
- refresh
- logout
- cookie HttpOnly/Secure
- ausência de token em storage
- bloqueio de origem indevida

---

# FASE 7 — OBSERVABILIDADE OPERACIONAL

## STATUS
🔄 PARCIAL / TRANSVERSAL

## Objetivo

Permitir supervisão técnica e operacional do SaaS, API, auth, financeiro, acesso, dispositivos físicos, gateways locais e integrações futuras.

Base já concluída nesta mini-fase:

- correlation_id por request
- validação do `x-correlation-id` recebido
- logs estruturados mínimos por request
- `GET /health`
- fallback 404 JSON com `correlation_id`
- erro interno 500 seguro com `correlation_id`
- inventário documental inicial em [docs/governance/error-contracts.md](/C:/sistema-academia-main/docs/governance/error-contracts.md)

A observabilidade deve responder:

- onde a operação falhou?
- qual componente falhou?
- qual aluno/unidade/dispositivo foi afetado?
- foi erro técnico ou decisão de negócio?
- o payload chegou?
- o payload foi parseado?
- a credencial foi resolvida?
- a regra de acesso bloqueou corretamente?
- o comando chegou ao dispositivo?
- houve timeout, replay, payload inválido ou dispositivo offline?

## Princípio

```txt
Instrumentar primeiro
Visualizar depois
Alertar depois
Automatizar resposta depois
```

## OBS-01 — CORRELATION ID E LOGS ESTRUTURADOS

### Status

- concluído na base atual
- evoluções futuras ficam para fases posteriores de observabilidade

### Inclui

- correlation_id por request crítica
- logs JSON
- request logging
- latência básica
- healthcheck API
- separação entre erro técnico e decisão de negócio

### Fora de escopo

- Grafana
- Prometheus
- Zabbix
- GLPI
- mensageria pesada
- tracing distribuído completo

## OBS-02 — CATÁLOGO DE ERROS

### Status

- inventário inicial concluído
- padronização futura ainda pendente

### Categorias

- AUTH_*
- SESSION_*
- ACCESS_*
- FINANCIAL_*
- DEVICE_*
- PROVIDER_*
- TRANSPORT_*
- DATABASE_*
- SECURITY_*
- INTEGRATION_*

### Exemplos

- DEVICE_OFFLINE
- TCP_TIMEOUT
- SERIAL_PORT_NOT_FOUND
- PROTOCOL_PARSE_ERROR
- INVALID_PAYLOAD_FORMAT
- UNKNOWN_CREDENTIAL
- BLOCKED_OVERDUE
- BLOCKED_NO_ACTIVE_SUBSCRIPTION
- COMMAND_SEND_FAILED
- REPLAY_DETECTED
- UNAUTHORIZED_DEVICE

## OBS-03 — EVENTOS INTERNOS DE INTEGRAÇÃO

### Entidades previstas

- integration_events
- device_health
- gateway_heartbeats
- device_protocol_transactions
- access_attempts enriquecido

## OBS-04 — MONITOR OPERACIONAL INTERNO

### Telas previstas

- monitor de API
- monitor de acesso
- monitor de dispositivos
- últimas falhas críticas
- drill-down por correlation_id

## OBS-05 — OBSERVABILIDADE DE PROTOCOLO/DISPOSITIVO

### Pipeline monitorado

- raw_payload_received
- payload_parsed
- event_normalized
- credential_resolved
- student_resolved
- decision_evaluated
- command_sent
- command_acknowledged
- attempt_logged
- failed

## OBS-06 — EXPORTAÇÃO EXTERNA

### Ferramentas futuras

- Prometheus
- Grafana
- Loki
- Sentry

### Métricas futuras

- requests por rota
- latência p95/p99
- erros por rota
- erros por provider
- tentativas por unidade
- bloqueios por motivo
- dispositivos offline
- gateways offline
- falhas de auth
- falhas de job financeiro

## OBS-07 — MONITORAMENTO DE REDE E ATIVOS

### Ferramentas candidatas

- Zabbix para rede, hosts, ping, portas, disponibilidade
- GLPI para inventário, chamados e histórico de manutenção

### Quando usar Zabbix

- existir gateway local em academia real
- houver dispositivos IP em rede local
- precisar monitorar ping/porta/host/latência

### Quando usar GLPI

- houver múltiplas academias/clientes
- necessidade de inventário de equipamentos
- necessidade de chamados/manutenção

### Fora de escopo agora

- implantar Zabbix/GLPI antes de dispositivo real

---

# FASE 8 — KPIs FINANCEIROS PROFISSIONAIS

## STATUS
🔄 BASE DE COBERTURA, ACESSO E FINANCEIRO CANÔNICO IMPLEMENTADA; KPIs AVANÇADOS SEGUEM FUTUROS

## Regra comercial consolidada de cobertura e cobrança

- acesso depende de cobertura paga vigente
- sem cobertura paga vigente, o acesso deve ser bloqueado
- plano avulso/mensal sem contrato nao gera divida automatica se o aluno faltar, parar ou nao renovar
- mensalidade `em_aberto` em plano avulso representa pendencia operacional ou ciclo nao confirmado, nao inadimplencia universal
- quando o aluno avulso voltar, paga novo ciclo e recebe nova cobertura; a pendencia antiga nao deve ser assumida automaticamente como divida real
- planos trimestral, semestral e anual sao pacotes pre-pagos; o pagamento ocorre no ato e a cobertura/vigencia nasce para todo o periodo contratado
- pacote pre-pago nao deve gerar 3/6/12 mensalidades em aberto como divida duplicada
- cobranca/pagamento e cobertura/vigencia de acesso sao conceitos relacionados, mas distintos; inadimplencia real exige contrato, pacote, consumo autorizado, recorrencia assumida ou regra comercial explicita
- dashboards futuros devem separar receita recebida, cobertura ativa, pendencias operacionais e inadimplencia real
- `em_aberto` de plano avulso nao deve inflar automaticamente inadimplencia nem receita a receber real
- `parcial` nao libera acesso por padrao
- override manual de acesso exige auditoria
- cron/scheduler futuro nao deve criar mensalidade automaticamente para todo aluno ativo
- cron futuro deve ser apenas de diagnostico/reconciliacao idempotente, chamando service transacional e idempotente que continue sendo o dono da regra
- em monolito local, scheduler futuro pode usar `node-cron` apenas se a dependencia for reintroduzida explicitamente; hoje `node-cron` nao esta instalado no projeto
- a implementacao futura nao deve depender de hardcode por nome de plano, texto livre, duracao fixa ou `ifs` espalhados em `AccessService`, `MensalidadeService`, `FinanceiroService` ou cron
- a politica deve ser parametrizada por campos/configuracao do plano e interpretada por camada central de dominio, com atributos como `tipo_cobranca`, `duracao_meses` ou `duracao_dias`, `exige_pagamento_ato`, `gera_divida_automatica`, `gera_cobertura_apos_pagamento`, `permite_renovacao_avulsa` e politica de desconto
- a decisao de cobranca e acesso deve consultar um service central de politica de plano/cobertura para evitar duplicacao de regra e divergencia entre modulos
- exemplo conceitual: `AVULSO_MENSAL` exige pagamento no ato, gera cobertura apos pagamento e nao gera divida automatica; `PACOTE_PRE_PAGO` exige pagamento no ato, gera cobertura pela vigencia contratada e nao gera mensalidades em aberto duplicadas; `RECORRENTE_CONTRATUAL` fica para futuro, apenas quando existir contrato ou regra comercial explicita, podendo gerar divida automatica

### Especificacao minima de politica de plano e cobertura

- plano e o cadastro comercial base ofertado ao aluno
- politica do plano e a regra parametrizada que define como esse plano cobra, gera cobertura e trata renovacao, desconto e inadimplencia
- cobranca e o evento ou titulo operacional que registra o ciclo ou obrigacao comercial
- pagamento confirmado e o fato financeiro que pode habilitar cobertura conforme a politica do plano
- cobertura ou vigencia de acesso e o periodo em que o aluno pode entrar porque existe autorizacao comercial valida
- mensalidade e a representacao operacional de cobranca por ciclo; nao deve ser tratada universalmente como cobertura paga nem como divida real
- pendencia operacional e um ciclo, cobranca ou inconsistencia que exige tratamento, sem implicar inadimplencia real por padrao
- inadimplencia real exige contrato, recorrencia assumida, consumo autorizado, pacote contratado ou regra comercial explicita
- `AVULSO_MENSAL`: exige pagamento no ato, pagamento gera cobertura pelo ciclo, nao gera divida automatica se nao renovar, `em_aberto` nao libera acesso e `em_aberto` antigo nao e inadimplencia real por padrao
- `PACOTE_PRE_PAGO`: exige pagamento no ato, pagamento gera cobertura por toda a vigencia, nao gera mensalidades futuras em aberto como divida duplicada e desconto depende do pagamento do pacote
- `RECORRENTE_CONTRATUAL`: fica para fase futura, so existe com contrato ou regra explicita e pode gerar divida automatica conforme a politica
- `CORTESIA` ou `ISENTO`: ficam para fase futura e devem ser explicitos, auditaveis e tratados como politica formal de cobertura
- `AccessService` nao deve tratar `em_aberto` como cobertura paga; cobertura valida deve derivar de pagamento confirmado, pacote pago, cortesia explicita ou politica equivalente
- ausencia de cobertura deve bloquear acesso, mas nao deve ser interpretada automaticamente como divida
- receita recebida deve nascer de pagamento confirmado; `em_aberto` de avulso e pendencia operacional, nao inadimplencia real
- KPI de inadimplencia real so deve considerar contrato, recorrencia, consumo autorizado ou regra comercial explicita
- scheduler futuro nao cria mensalidade para todo aluno ativo; ele chama service idempotente de diagnostico e reconciliacao
- scheduler futuro deve nascer desativavel por configuracao e preparado para lock/idempotencia em monolito local hoje e multiplas instancias no futuro

## Base implementada no estado atual

- `PlanoPolicyService` existe e centraliza política de plano
- `CoberturaService` existe e centraliza preview, contratação e renovação
- `AccessService` usa cobertura paga vigente como base de liberação
- contratação ou renovação transacional existe em `POST /planos/contratar-renovar`
- preview de cobertura existe em `POST /planos/preview-cobertura`
- contratação assistida exige pagamento integral
- pagamento parcial não libera por padrão
- cobertura sobreposta é bloqueada antes de criar nova cobrança ou pagamento
- o frontend usa `cobertura_paga_vigente` e `cobertura_status` como verdade principal de cobertura

## Diagnóstico operacional atual

- `tests/scripts/diagnostico-consistencia.cmd` existe e é read-only
- o diagnóstico abre o SQLite em modo somente leitura
- não corrige dados
- não cria mensalidade
- não sincroniza financeiro
- não é scheduler
- roda 12 checks
- criticidades `critico` e `alto` são bloqueantes
- o achado informativo esperado hoje é aluno `AVULSO_MENSAL` sem cobertura paga vigente

## Scheduler e jobs atuais

- não há scheduler operacional ativo
- não existe job automático criando mensalidade, pagamento, cobertura ou conta financeira
- `sincronizarFinanceiro` existe apenas como fluxo manual ou acionado por rota, não por agendamento
- scheduler futuro, se existir, deve nascer explicitamente com idempotência, auditoria, dry-run ou diagnóstico, escopo `tenant_id` e `unit_id`, proteção contra criação cega de mensalidades, testes e documentação própria

## Frontend financeiro atual

- telas ativas preservadas:
  - `frontend/src/pages/financeiro/FinanceiroLayout.jsx`
  - `frontend/src/pages/financeiro/FinanceiroDashboard.jsx`
  - `frontend/src/pages/financeiro/ContasFinanceirasPage.jsx`
  - `frontend/src/pages/financeiro/PlanoContasPage.jsx`
- services ativos preservados:
  - `frontend/src/services/dashboardService.js`
  - `frontend/src/services/contasFinanceiras.js`
- rotas financeiras ativas:
  - `/financeiro`
  - `/financeiro/dashboardFinanceiro`
  - `/financeiro/contas-financeiras`
  - `/financeiro/plano-contas`

## Objetivo

Transformar o dashboard em BI operacional real.

## KPIs previstos

- receita líquida
- inadimplência
- ticket médio
- retenção
- churn
- fluxo de caixa
- lucro estimado
- despesas
- consolidação multi-unidade

## Pré-requisito

```txt
FIN-KPI-01 — Contrato formal de KPIs financeiros
```

---

# CHECKPOINT — LEGADOS JÁ REMOVIDOS

## Status
✅ CONCLUÍDO

## Financeiro backend legado removido

- `backend/routes/financeiro.js` foi removido
- a montagem `app.use('/financeiro', require('./routes/financeiro'))` foi removida
- rotas removidas:
  - `GET /financeiro/kpis`
  - `GET /financeiro/fluxo`
  - `GET /financeiro/mensalidades`
  - `GET /financeiro/vendas-produtos`
- motivo:
  - sem consumidor ativo
  - sem uso em scripts ou package
  - risco de dupla contagem
  - semântica inferior aos endpoints canônicos

## Script destrutivo removido

- `backend/scripts/limparMensalidadesAlpha.js` foi removido
- motivo:
  - classificado como `perigoso_sem_uso`
  - apagava `pagamento`, `mensalidade` e `conta_financeira` em lote
  - não exigia confirmação
  - não respeitava `tenant_id` ou `unit_id`
  - não respeitava fechamento mensal
  - não registrava auditoria
  - não tinha uso versionado
- não substituir por outro script destrutivo cego

## Arquivo vazio de acesso removido

- `backend/services/acessoService.js` foi removido
- `backend/services/AccessService.js` permanece como serviço canônico
- `frontend/src/services/acessoService.js` é arquivo diferente, ativo, e não deve ser confundido com o backend

## Frontend financeiro legado removido

- `frontend/src/pages/financeiro/FiltrosFinanceiro.jsx`
- `frontend/src/pages/financeiro/FinanceiroIndex.jsx`
- `frontend/src/pages/financeiro/RelatoriosFinanceiro.jsx`
- `frontend/src/pages/financeiro/TabelaPendencias.jsx`
- `frontend/src/pages/financeiro/Consolidado.jsx`
- `frontend/src/pages/financeiro/ContasFinanceiras.jsx`

---

# POLÍTICA FUTURA — SANEAMENTO CONTROLADO DE LEGADO

## Status
⏳ FUTURA

## Princípio de saneamento

- remover lixo legado melhora a saúde do produto
- reduz contexto desnecessário para IA/Codex
- reduz risco de reutilização de fluxo antigo
- reduz ambiguidade operacional
- reduz superfície de bugs e manutenção

Legado pode e deve ser removido quando for comprovadamente morto, perigoso ou incompatível com a arquitetura atual, mas nunca por varredura cega apenas porque não aparece no fluxo-pai.

## Critério para remover

Um artefato pode ser removido quando:

- não está importado ou montado
- não é usado pelo frontend
- não é chamado por backend, scripts, testes ou smokes
- não é necessário para migration ou schema histórico
- não é fallback operacional documentado
- não é compatibilidade temporária
- existe substituto atual mais seguro
- buscas e validações confirmam ausência de uso

## Critério para manter temporariamente

Manter ou deprecar em vez de remover quando:

- ainda há uso ativo
- há dúvida sobre dependência indireta
- é compatibilidade temporária
- é fallback operacional conhecido
- é necessário para migração de bancos antigos
- ainda não existe substituto seguro
- a remoção exigiria refactor amplo

## Classificação futura de legado

Todo item suspeito deve ser classificado como:

- morto comprovado: remover
- perigoso e sem uso: remover ou deprecar forte
- perigoso, mas ainda usado: substituir primeiro, remover depois
- compatibilidade: manter temporariamente e documentar
- desconhecido: investigar, não remover ainda

## Processo obrigatório

A limpeza futura deve ocorrer em blocos pequenos:

- `LEGACY-01`: inventário de legados mortos ou perigosos
- `LEGACY-02`: remoção de arquivos mortos comprovados
- `LEGACY-03`: depreciação de fluxos legados ainda preservados
- `LEGACY-04`: limpeza de services e wrappers frontend sem uso
- `LEGACY-05`: checkpoint de build, smokes e docs

## O que não remover sem cuidado

- `ensureSchema` e migrations antigas
- campos preservados por compatibilidade, como status antigos ainda consumidos
- smokes e testes úteis
- permissões antigas sem varredura completa
- fluxos administrativos ainda preservados
- arquivos cujo uso não foi comprovadamente descartado

## Regra de validação

Antes de remover legado:

- buscar referências com `rg`
- checar imports e montagem
- checar rotas ativas
- checar frontend
- checar scripts e testes
- rodar build e smokes relevantes
- manter commits pequenos e reversíveis

## Relação com scheduler e jobs

A limpeza de legado deve ocorrer antes de criar automações recorrentes perigosas.

Scheduler futuro ou `node-cron` reintroduzido explicitamente não deve depender de código legado, scripts antigos ou fluxos herdados sem revisão.

---

# FASE 9 — ACCESS DEVICE PLATFORM

## STATUS
⏳ FUTURA

## Objetivo

Criar plataforma modular de integração com:

- Hikvision
- ControlID
- Intelbras
- Henry
- TopData
- outros dispositivos

## Regra principal

O backend SEMPRE decide:

```txt
liberar
bloquear
override
```

O hardware apenas identifica e/ou executa.

## BLOCO 9A — CONTRATO DE DOMÍNIO DE ACESSO FÍSICO

### Inclui

- AccessIdentificationEvent
- AccessDecision
- DeviceCommand
- ProviderAdapter
- TransportAdapter
- DeviceCapabilities
- ErrorCatalog inicial

## BLOCO 9B — MODELO PERSISTENTE

### Inclui

- access_devices
- access_credentials
- access_attempts
- manual_access_overrides
- device_health

## BLOCO 9C — PROVIDER SIMULATOR

### Inclui

- cartão mock
- PIN mock
- facial webcam mock
- catraca mock
- payloads simulados
- falhas simuladas

## BLOCO 9D — GATEWAY LOCAL CONCEITUAL/MVP

### Inclui

- processo local/Electron/Node
- comunicação com API
- heartbeat
- fila local simples
- retry controlado
- modo offline futuro

## BLOCO 9E — OBSERVABILIDADE DE PROTOCOLO

### Inclui

- raw payload redigido/hasheado
- parse status
- normalize status
- command status
- latency
- correlation_id
- error_code

## BLOCO 9F — ENROLLMENT DE CREDENCIAIS

### Inclui

- facial
- cartão
- PIN
- fingerprint placeholder
- revogação
- consentimento/segurança

## BLOCO 9G — PRIMEIRO PROVIDER REAL

### Estratégia

- escolher um fabricante
- integrar somente 1 modelo inicialmente
- não generalizar cedo demais
- validar com hardware físico

## BLOCO 9H — HARDENING DE DISPOSITIVOS

### Inclui

- anti-replay
- assinatura de gateway
- device secret
- rate limit
- allowlist
- clock skew
- timeout/retry
- heartbeat
- reconnect
- filas
- cache offline
- sync facial
- multi dispositivo

---

# FASE 10 — IA / AUTOMAÇÃO

## STATUS
⏳ FUTURA

## Objetivo

Operação quase solo baseada em IA.

## Futuro planejado

- agentes locais
- automação financeira
- geração de relatórios
- suporte automatizado
- dashboards inteligentes
- geração de sistemas auxiliares
- análise operacional
- automação com MCP
- RAG técnico do projeto

---

# PRIORIDADE IMEDIATA

## Sequência recomendada

```txt
1. Gate principal: `tests\scripts\smoke-auth.cmd`, `tests\scripts\smoke-acesso.cmd` e `npm.cmd --prefix frontend run build`
2. BLOCO 6A — Setup Playwright (infraestrutura experimental já criada)
3. BLOCO 6B — E2E Auth (criado, mas fora do gate principal)
4. BLOCO 6C — E2E Permissões (pausado)
5. BLOCO 6D — E2E Acesso (pausado)
6. BLOCO 6E — MCP (futuro)
7. OBS-03 — Eventos internos de integração
8. BLOCO 9A — Contrato Access Device Platform
9. BLOCO 9B — Modelo persistente
10. BLOCO 9C — Provider Simulator
```

## Não priorizar agora

- PostgreSQL antes de estabilizar testes críticos
- Docker/produção antes de smoke/E2E mínimo
- catraca real antes de contrato/simulador
- Grafana/Zabbix/GLPI antes de instrumentação interna
- microservices
- event-driven completo
- Kafka/RabbitMQ
- provider real múltiplo
