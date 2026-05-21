# Contexto Operacional Atual — Sistema Academia SA

## Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Banco atual: SQLite
- Banco futuro: PostgreSQL
- Auth: token opaco server-side
- Refresh token: cookie HttpOnly
- Access token frontend: apenas em memória
- API client: Axios com `withCredentials`
- Desktop/futuro gateway: Electron/Node

## Estado atual

O sistema já possui:

- arquitetura modular
- services frontend por domínio
- `Api.js` como boundary HTTP central
- hardening inicial
- CORS por ambiente
- cookies seguros/configuráveis
- security headers
- smoke-auth
- smoke-acesso
- auditoria crítica
- regra de acesso em tempo real
- domínio financeiro base
- multi-unidade inicial
- documentação/governança

## Posição atual no Fluxo Pai

```txt
FASE 4 — Estabilização Profissional
CHECKPOINT 5.1 — Auth local / smoke-auth gate
Depois: BLOCO 6A — Setup Playwright
```

## Pendência operacional conhecida

`tests\scripts\smoke-auth.cmd -Login admin` já falhou com `401` por credencial local inválida no SQLite atual.

Antes de avançar para Playwright/E2E de auth, corrigir credencial/admin local ou criar reset/bootstrap seguro.

## Validações recentes esperadas

- `npm.cmd --prefix frontend run build`
- `tests\scripts\smoke-auth.cmd`
- `tests\scripts\smoke-acesso.cmd`
- `node --check` nos arquivos backend alterados

## Atenção

Não reintroduzir token em `localStorage` ou `sessionStorage`.

Não trocar estratégia de auth sem decisão arquitetural.

Não iniciar PostgreSQL, Docker, catraca real ou IA antes de blindar fluxos críticos com testes suficientes.

## Próxima sequência recomendada

1. CHECKPOINT 5.1 — corrigir smoke-auth local
2. BLOCO 6A — setup Playwright
3. BLOCO 6B — E2E Auth
4. BLOCO 6C — E2E Permissões
5. BLOCO 6D — E2E Acesso
6. BLOCO 6E — MCP
7. OBS-01/02/03 — observabilidade interna mínima
8. FASE 9A/9B/9C — contrato access device + persistência + simulador
