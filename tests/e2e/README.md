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
- backend em `http://localhost:3001`
- frontend Vite em `http://localhost:5173`

## Auth E2E

Para a suite real de autenticacao, defina credenciais locais por variavel de ambiente:

```powershell
$env:E2E_LOGIN="admin"
$env:E2E_PASSWORD="SUA_SENHA_LOCAL"
npm run e2e:auth
```

Alternativa CMD:

```cmd
set E2E_LOGIN=admin
set E2E_PASSWORD=SUA_SENHA_LOCAL
npm run e2e:auth
```

Cobertura inicial:

- login pela UI
- acesso a rota protegida
- reload mantendo sessao via refresh cookie
- ausencia de bearer em `localStorage` e `sessionStorage`
- logout
- bloqueio de rota protegida apos logout

Se os browsers ainda nao estiverem instalados, rode:

```cmd
npx playwright install chromium
```

## Venda com SQLite descartável

```powershell
npx.cmd playwright install chromium
pwsh -NoProfile -ExecutionPolicy Bypass -File tests/scripts/smoke-sqlite.ps1 -Playwright
```

O runner cria uma cópia temporária do backend, semeia um SQLite descartável e sobe a API e o frontend em portas locais livres. A suíte verifica login, venda pela recepção na Matriz, venda pelo dono na Filial, exibição da venda após um filtro histórico, baixa do estoque e recusa ao operador de acesso. O check nos PRs é **Playwright E2E**, no workflow **Node 24**.

## Cenários futuros

- login pela UI
- dashboard
- logout
- permissoes visuais
- financeiro restrito
- historico restrito
- acesso direto por rota protegida
- fluxo de pagamento
- fluxo de aluno
- consolidado somente leitura

## Estado atual

- sanity test de `/login`
- screenshots e traces apenas em falha
- base pronta para blocos de auth, permissoes e acesso
