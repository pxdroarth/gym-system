# Testes - Sistema Academia SA

## 1. Objetivo

Esta pasta concentra scripts, colecoes e referencias para validacao manual e automatizada do Sistema Academia SA. O foco atual e tornar os testes repetiveis, seguros e rastreaveis sem alterar o produto.

## 2. Estrutura

- `scripts/`: testes rapidos via CMD/PowerShell.
- `insomnia/`: colecoes e ambientes para API.
- `e2e/`: testes de frontend com Playwright.
- `k6/`: testes futuros de carga/performance de API.
- `jmeter/`: testes futuros de carga com plano visual e relatorio.
- `README.md`: guia geral da estrategia de testes.

## 3. Ordem recomendada de execucao

1. Check de versoes.
2. Instalacao de dependencias com `npm ci` ou `npm install`.
3. Check de ambiente.
4. Backend rodando.
5. Smoke auth.
6. Smoke API via Insomnia.
7. Smoke frontend/manual.
8. E2E com Playwright.
9. Carga com k6/JMeter futuramente.

## 4. Pre-requisitos gerais

- Node.js.
- `npm install` executado na raiz do projeto.
- Backend em `http://localhost:3001`.
- Frontend em `http://localhost:5173`, quando aplicavel.
- SQLite local.
- Dados ficticios/teste.
- Insomnia opcional.
- PowerShell disponivel no Windows.

## 5. Comandos principais

Validacao de versoes:

```cmd
tests\scripts\check-versions.cmd
```

Validacao de ambiente local:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\check-env.ps1
```

Pelo CMD:

```cmd
tests\scripts\check-env.cmd
```

Smoke de autenticacao ja disponivel:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -Login admin
```

Pelo CMD:

```cmd
tests\scripts\smoke-auth.cmd -Login admin
```

A senha sera solicitada interativamente se nao for passada por parametro.

Exemplo com senha por parametro:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -Login admin -Senha "SUA_SENHA"
```

Esse formato e util em validacao local controlada, mas nao e recomendado salvar senha em historico, shell script, README complementar ou arquivo versionado.

Smoke de acesso/mensalidade:

```cmd
tests\scripts\smoke-acesso.cmd
```

Esse teste usa fixtures locais com prefixo `SMOKE_ACESSO_`, valida a regra de acesso sem tolerancia automatica e limpa apenas os registros criados por ele. Use somente em banco local/demo, nunca em producao.

Playwright E2E minimo:

```cmd
npm run e2e
```

Alternativa:

```cmd
tests\scripts\e2e-playwright.cmd
```

O setup inicial sobe backend + frontend automaticamente e roda um sanity test da tela de login. A base completa fica em `tests/e2e/`.

Suite inicial de auth E2E:

```cmd
npm run e2e:auth
```

Use credenciais locais por ambiente:

- `E2E_LOGIN`
- `E2E_PASSWORD`

Checklist de seguranca do Bloco 5:

- CORS local deve aceitar `http://localhost:3000` e `http://localhost:5173`.
- Producao deve configurar `CORS_ORIGINS` ou `FRONTEND_URL` sem usar `*`.
- Cookie `academia_sa_refresh` deve permanecer `HttpOnly`.
- Cookie `Secure` deve estar ativo em producao com HTTPS.
- Access token nao deve voltar para `localStorage` ou `sessionStorage`.

## 6. Politica de seguranca

- Nao commitar senha.
- Nao commitar token.
- Nao commitar cookie.
- Nao commitar environment local com segredo.
- Usar arquivos `.example` para variaveis e ambientes.
- Usar `logout-all` apos testes sensiveis quando necessario.

## 7. Status dos testes

| Categoria | Ferramenta | Status | Observacao |
|---|---|---|---|
| Auth backend | `tests/scripts/smoke-auth.ps1` | feito | Cobre `/test-db`, login, cookie HttpOnly, `/auth/me`, refresh, token antigo invalido, logout e logout-all. |
| Auth frontend | Manual + build | parcial | Bloco 4 usa access token em memoria e refresh cookie HttpOnly; `localStorage`/`sessionStorage` nao devem guardar bearer token. |
| Hardening producao | Manual + smoke auth | parcial | Bloco 5 cobre CORS por ambiente, cookie Secure/SameSite, HTTPS documentado e headers minimos. |
| Frontend E2E | Playwright | parcial | Blocos 6A/6B adicionam setup minimo, script, sanity de `/login` e primeira suite real de auth por env. |
| Acesso/mensalidade | `tests/scripts/smoke-acesso.js` | feito | Cobre bloqueio sem mensalidade, vencida/parcial vencida, liberacoes regulares, POST comum, PUT/DELETE imutaveis e liberacao manual auditada. |
| API geral | Insomnia | pendente | Colecoes e ambientes serao organizados nesta pasta. |
| Permissoes | Manual + Insomnia + futuro E2E | parcial | A matriz existe; a cobertura operacional ainda precisa crescer por perfil. |
| Carga API | k6 | pendente | Nao instalado nesta sprint e depende de massa estavel. |
| Carga completa | JMeter | pendente | Plano `.jmx` e relatorio ficam para etapa futura. |
| Auditoria | Manual + API | parcial | Eventos de auth ja sao cobertos indiretamente; escopo e leitura ainda pedem expansao. |
| Dominios criticos | Manual + API | parcial | Alunos, mensalidades, pagamentos, vendas, acessos e vinculos ainda serao consolidados. |

## 8. Insomnia

- Documentacao: [tests/insomnia/README.md](insomnia/README.md)
- Mapa de requests: [tests/insomnia/requests-map.md](insomnia/requests-map.md)
