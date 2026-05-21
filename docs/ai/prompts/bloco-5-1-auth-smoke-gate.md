# Prompt Codex — CHECKPOINT 5.1 AUTH LOCAL / SMOKE GATE

## Objetivo

Garantir que o ambiente local tenha credencial admin válida e que o `smoke-auth` volte a passar sem alterar a arquitetura de autenticação.

## Contexto

O sistema usa:

- token opaco server-side
- refresh token via cookie HttpOnly
- access token frontend apenas em memória
- reload via `/auth/refresh`
- frontend com `withCredentials`

Há pendência operacional conhecida:

```txt
tests\scripts\smoke-auth.cmd -Login admin
falhou com 401 por credencial local inválida no SQLite atual
```

## Escopo

- investigar como o admin local é criado/autenticado
- validar credencial admin atual
- criar ou ajustar script seguro de reset/bootstrap admin, se necessário
- documentar procedimento local
- rodar smoke-auth
- rodar smoke-acesso
- garantir que token não volte para localStorage/sessionStorage

## Fora de escopo

- não mudar arquitetura de auth
- não trocar token opaco
- não alterar refresh token
- não alterar cookies
- não mexer em RBAC
- não mexer em permissões
- não iniciar Playwright
- não alterar regra de acesso

## Arquivos esperados

Possíveis, conforme investigação:

- backend scripts/bootstrap/reset admin
- docs/setup/ambiente-local.md
- docs/governance/smoke-tests.md
- README se necessário

## Validações obrigatórias

```bash
tests\scripts\smoke-auth.cmd
tests\scripts\smoke-acesso.cmd
npm.cmd --prefix frontend run build
```

Para arquivos JS backend alterados:

```bash
node --check caminho/do/arquivo.js
```

## Retorno obrigatório

Responder com:

1. Arquivos alterados
2. Mudanças aplicadas
3. Fora de escopo respeitado
4. Validações executadas
5. Resultado das validações
6. Riscos restantes
7. Pendências
8. Próximo passo recomendado
