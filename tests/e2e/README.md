# Testes E2E

Esta pasta usa Playwright para validar o frontend real no navegador, cobrindo navegacao, autenticacao e fluxos criticos de interface.

Neste bloco foi criado apenas o setup minimo e incremental.

## Estrutura atual

```txt
tests/
  e2e/
    playwright/
      smoke.spec.js
    fixtures/
    screenshots/
    traces/
```

## Como rodar

Pela raiz:

```cmd
npm run e2e
```

Alternativa direta:

```cmd
tests\scripts\e2e-playwright.cmd
```

O setup sobe:

- backend em `http://127.0.0.1:3001`
- frontend Vite em `http://127.0.0.1:4173`

Se os browsers ainda nao estiverem instalados, rode:

```cmd
npx playwright install chromium
```

## Cenarios futuros

- login pela UI
- dashboard
- logout
- permissoes visuais
- financeiro restrito
- historico restrito
- acesso direto por rota protegida
- fluxo de pagamento
- fluxo de aluno
- fluxo de venda
- consolidado somente leitura

## Estado atual

- sanity test de `/login`
- screenshots e traces apenas em falha
- base pronta para blocos de auth, permissoes e acesso
