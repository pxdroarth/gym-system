# Prompt Codex — BLOCO 6A SETUP PLAYWRIGHT

## Objetivo

Adicionar setup mínimo e incremental de Playwright para começar E2E dos fluxos críticos.

## Pré-requisito

Antes deste bloco, o CHECKPOINT 5.1 deve estar verde:

```bash
tests\scripts\smoke-auth.cmd
tests\scripts\smoke-acesso.cmd
```

## Escopo

- instalar/configurar `@playwright/test`
- criar `playwright.config`
- estruturar diretórios E2E
- habilitar screenshots/traces em falha
- preparar helpers mínimos
- criar teste inicial simples, preferencialmente health/login se ambiente permitir

## Fora de escopo

- não refatorar auth
- não alterar regra de acesso
- não alterar permissões
- não mexer em banco além do necessário para testes
- não criar suíte grande
- não adicionar MCP ainda
- não alterar arquitetura frontend/backend

## Estrutura esperada

```txt
tests/
  e2e/
    playwright/
    fixtures/
    screenshots/
    traces/
```

## Validações obrigatórias

```bash
npm.cmd --prefix frontend run build
tests\scripts\smoke-auth.cmd
tests\scripts\smoke-acesso.cmd
```

Se criar scripts npm, validar execução do comando E2E mínimo.

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
