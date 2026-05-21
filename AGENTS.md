# AGENTS.md — Sistema Academia SA

## Papel do agente

Você atua como executor técnico supervisionado em um SaaS ERP multi-tenant para academias.

O projeto NÃO deve ser tratado como CRUD acadêmico, tutorial ou TCC simples.

O projeto deve ser tratado como:

```txt
ERP SaaS operacional real
+
plataforma de acesso físico
+
gateway local futuro
+
observabilidade operacional
+
automação assistida por IA
```

## Prioridade técnica

1. segurança
2. estabilidade
3. arquitetura
4. governança
5. testes
6. operação
7. performance
8. UX
9. features novas

## Perfil de modelo/inteligência por escopo

Regra global obrigatória:

```txt
Não usar modelos mini.
Não usar inteligência baixa.
Piso mínimo do projeto: GPT-5.4 com inteligência média.

## Contexto obrigatório

Antes de mudanças relevantes, consulte:

- `docs/governance/fluxo-pai.md`
- `docs/governance/smoke-tests.md`
- `docs/governance/requisitos-base.md`
- `docs/ai/contexto-operacional.md`
- `docs/ai/modo-de-trabalho-codex.md`
- `docs/setup/seguranca-producao.md`

Quando a tarefa envolver acesso físico, dispositivos, biometria, facial, catraca ou gateway, consulte também:

- `docs/architecture/access-device-platform.md`
- `docs/architecture/observability-layer.md`

## Estado atual do fluxo

Posição atual:

```txt
FASE 4 — Estabilização Profissional
CHECKPOINT 5.1 — Auth local / smoke-auth gate
Depois: BLOCO 6A — Setup Playwright
```

Não iniciar Playwright antes de resolver o `smoke-auth` local se a tarefa envolver auth/E2E.

## Restrições críticas

Nunca fazer refactor gigante.

Nunca misturar em um mesmo diff, sem autorização explícita:

- auth
- sessão
- financeiro
- pagamentos
- mensalidades
- acesso
- permissões
- auditoria
- catraca
- biometria
- reconhecimento facial

Nunca remover compatibilidade legada sem plano de transição.

Nunca alterar regra de acesso sem smoke.

Nunca persistir token bearer em `localStorage` ou `sessionStorage`.

Nunca alterar fluxo de refresh/cookie sem validação explícita.

## Regra crítica de acesso

Regra padrão:

```txt
default deny
```

Aluno deve ser bloqueado quando:

- estiver inativo
- estiver sem mensalidade vigente
- estiver com mensalidade vencida
- tiver pendência crítica
- tiver bloqueio manual
- estiver fora do escopo da unidade

Aluno ativo SEM mensalidade vigente:

```txt
=> BLOQUEADO
```

Exceção:

```txt
override manual auditado
```

O backend sempre decide o acesso. Hardware apenas identifica e/ou executa comando físico.

## Auth atual

Estado atual:

- token opaco server-side
- refresh token via cookie HttpOnly
- access token no frontend apenas em memória
- frontend usa `withCredentials`
- reload de sessão depende de `/auth/refresh`
- `Api.js` concentra infraestrutura HTTP
- pages/components usam services por domínio

Não reintroduzir JWT/localStorage/sessionStorage sem decisão arquitetural explícita.

## Validações obrigatórias

Após mudanças no frontend:

```bash
npm.cmd --prefix frontend run build
```

Após mudanças em auth/acesso:

```bash
tests\scripts\smoke-auth.cmd
tests\scripts\smoke-acesso.cmd
```

Após mudanças JS backend relevantes:

```bash
node --check caminho/do/arquivo.js
```

## Formato obrigatório de retorno

Responder sempre com:

1. Arquivos alterados
2. Mudanças aplicadas
3. Fora de escopo respeitado
4. Validações executadas
5. Resultado das validações
6. Riscos restantes
7. Pendências
8. Próximo passo recomendado
