# Testes — Sistema Academia SA

## 1. Objetivo

Esta pasta concentra scripts, coleções e referências para validação manual e automatizada do Sistema Academia SA. O foco atual é tornar os testes repetíveis, seguros e rastreáveis sem alterar o produto.

## 2. Estrutura

- `scripts/`: testes rápidos via CMD/PowerShell.
- `insomnia/`: coleções e ambientes para API.
- `e2e/`: testes futuros de frontend com Playwright.
- `k6/`: testes futuros de carga/performance de API.
- `jmeter/`: testes futuros de carga com plano visual e relatório.
- `README.md`: guia geral da estratégia de testes.

## 3. Ordem recomendada de execução

1. Check de versoes.
2. Instalacao de dependencias com `npm ci` ou `npm install`.
3. Check de ambiente.
4. Backend rodando.
5. Smoke auth.
6. Smoke API via Insomnia.
7. Smoke frontend/manual.
8. E2E com Playwright futuramente.
9. Carga com k6/JMeter futuramente.

## 4. Pré-requisitos gerais

- Node.js.
- `npm install` executado na raiz do projeto.
- Backend em `http://localhost:3001`.
- Frontend em `http://localhost:5173`, quando aplicável.
- SQLite local.
- Dados fictícios/teste.
- Insomnia opcional.
- PowerShell disponível no Windows.

## 5. Comandos principais

Validacao de versoes:

```cmd
tests\scripts\check-versions.cmd
```

Validação de ambiente local:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\check-env.ps1
```

Pelo CMD:

```cmd
tests\scripts\check-env.cmd
```

Smoke de autenticação já disponível:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -Login admin
```

Pelo CMD:

```cmd
tests\scripts\smoke-auth.cmd -Login admin
```

A senha será solicitada interativamente se não for passada por parâmetro.

Exemplo com senha por parâmetro:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -Login admin -Senha "SUA_SENHA"
```

Esse formato é útil em validação local controlada, mas não é recomendado salvar senha em histórico, shell script, README complementar ou arquivo versionado.

Smoke de acesso/mensalidade:

```cmd
tests\scripts\smoke-acesso.cmd
```

Esse teste usa fixtures locais com prefixo `SMOKE_ACESSO_`, valida a regra de acesso sem tolerancia automatica e limpa apenas os registros criados por ele. Use somente em banco local/demo, nunca em producao.

Checklist de seguranca do Bloco 5:

- CORS local deve aceitar `http://localhost:3000` e `http://localhost:5173`.
- Producao deve configurar `CORS_ORIGINS` ou `FRONTEND_URL` sem usar `*`.
- Cookie `academia_sa_refresh` deve permanecer `HttpOnly`.
- Cookie `Secure` deve estar ativo em producao com HTTPS.
- Access token nao deve voltar para `localStorage` ou `sessionStorage`.

## 6. Política de segurança

- Não commitar senha.
- Não commitar token.
- Não commitar cookie.
- Não commitar environment local com segredo.
- Usar arquivos `.example` para variáveis e ambientes.
- Usar `logout-all` após testes sensíveis quando necessário.

## 7. Status dos testes

| Categoria | Ferramenta | Status | Observação |
|---|---|---|---|
| Auth backend | `tests/scripts/smoke-auth.ps1` | feito | Cobre `/test-db`, login, cookie HttpOnly, `/auth/me`, refresh, token antigo inválido, logout e logout-all. |
| Auth frontend | Manual + build | parcial | Bloco 4 usa access token em memoria e refresh cookie HttpOnly; `localStorage`/`sessionStorage` nao devem guardar bearer token. |
| Hardening producao | Manual + smoke auth | parcial | Bloco 5 cobre CORS por ambiente, cookie Secure/SameSite, HTTPS documentado e headers minimos. |
| Acesso/mensalidade | `tests/scripts/smoke-acesso.js` | feito | Cobre bloqueio sem mensalidade, vencida/parcial vencida, liberacoes regulares, POST comum, PUT/DELETE imutaveis e liberacao manual auditada. |
| API geral | Insomnia | pendente | Coleções e ambientes serão organizados nesta pasta. |
| Permissões | Manual + Insomnia + futuro E2E | parcial | A matriz existe; a cobertura operacional ainda precisa crescer por perfil. |
| Frontend E2E | Playwright | pendente | Não instalado/configurado nesta sprint. |
| Carga API | k6 | pendente | Não instalado nesta sprint e depende de massa estável. |
| Carga completa | JMeter | pendente | Plano `.jmx` e relatório ficam para etapa futura. |
| Auditoria | Manual + API | parcial | Eventos de auth já são cobertos indiretamente; escopo e leitura ainda pedem expansão. |
| Domínios críticos | Manual + API | parcial | Alunos, mensalidades, pagamentos, vendas, acessos e vínculos ainda serão consolidados. |

## 8. Insomnia

- Documentação: [tests/insomnia/README.md](insomnia/README.md)
- Mapa de requests: [tests/insomnia/requests-map.md](insomnia/requests-map.md)
