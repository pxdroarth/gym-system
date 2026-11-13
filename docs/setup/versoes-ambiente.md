# Versoes de Ambiente - Sistema Academia SA

## 1. Objetivo

Este documento padroniza versoes globais e valida o setup inicial do Sistema Academia SA em PCs locais, especialmente no fluxo Windows com CMD/PowerShell.

## 2. Node.js

- Node.js LTS fixado em `24.22.3` para desenvolvimento, CI e implantação.
- `.nvmrc`, `.node-version` e `engines.node` dos dois pacotes declaram a mesma versão.
- Nos pull requests, o GitHub Actions lê `.node-version` e executa a verificação de versões, as duas instalações com `npm ci`, os smokes em SQLite descartável e o build de produção.
- No ambiente de implantação, selecione `24.22.3` na configuração do provedor ou da máquina que executa o backend e compila o frontend.
- Use `nvm` para trocar a versao antes de instalar dependencias.
- No Windows, use NVM for Windows ou alternativa equivalente para selecionar a versao indicada.

Exemplo:

```cmd
nvm install 24.22.3
nvm use 24.22.3
```

Se sua ferramenta nao ler `.nvmrc` automaticamente, abra o arquivo e use a versao indicada manualmente.

## 3. npm

- npm suportado: `>=9`. O Node 24.22.3 inclui npm 11.19.1.
- O npm e validado pelo script de versoes.
- `package-lock.json` deve ser mantido versionado na raiz.
- `frontend/package-lock.json` deve ser mantido versionado para as dependencias do frontend.
- Prefira `npm ci` em ambiente limpo quando o `package-lock.json` estiver presente.
- Use `npm install` quando for alterar dependencias de forma intencional.

## 4. Engines

- `package.json` e `frontend/package.json` declaram `engines`.
- A raiz usa `.npmrc` com `engine-strict=true`.
- Com `engine-strict=true`, o npm pode bloquear install quando Node/npm estiverem fora da faixa esperada.
- Se `engine-strict` bloquear a instalacao, verifique Node/npm com:

```cmd
tests\scripts\check-versions.cmd
```

## 5. Verificacao automatica

Pelo CMD:

```cmd
tests\scripts\check-versions.cmd
```

Alternativa PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\check-versions.ps1
```

Após `npm ci` na raiz e no frontend, reproduza os smokes e o build do CI no Windows com PowerShell 7:

```powershell
pwsh -NoProfile -File tests/scripts/smoke-sqlite.ps1
$env:NODE_ENV = 'production'
npm.cmd run build:frontend
```

Os smokes sobem uma API temporária com dados de teste e removem o SQLite ao encerrar.

## 6. Fluxo recomendado em PC novo

1. Clonar repositorio.
2. Instalar e usar a versão exata da `.nvmrc`.
3. Validar versoes:

```cmd
tests\scripts\check-versions.cmd
```

4. Instalar dependencias:

```cmd
npm ci
cd frontend
npm ci
cd ..
```

5. Validar ambiente:

```cmd
tests\scripts\check-env.cmd
```

6. Subir backend.
7. Rodar smoke auth:

```cmd
tests\scripts\smoke-auth.cmd -Login admin
```

Para deploy web, revise tambem [Seguranca de Producao](seguranca-producao.md), especialmente `NODE_ENV`, `CORS_ORIGINS`, `FRONTEND_URL`, `COOKIE_SECURE`, `COOKIE_SAME_SITE` e HTTPS.

## 7. Ferramentas opcionais

- Java e Graphviz para PlantUML.
- Insomnia para API.
- Playwright opcional para a [suíte E2E inicial](../../tests/e2e/README.md).
- k6/JMeter futuro.

Java e Graphviz nao sao obrigatorios para rodar backend, frontend ou SQLite local; eles ajudam apenas em fluxos de diagramas PlantUML.

## 8. Troubleshooting

### Node incompatível

Confira `.nvmrc`, instale a versao indicada com NVM for Windows ou equivalente e rode `tests\scripts\check-versions.cmd` de novo.

A verificação exige a versão exata fixada no repositório.

### npm incompatível

Atualize ou selecione uma instalacao do Node que traga npm dentro da faixa declarada em `engines`.

### nvm nao instalado

Instale NVM for Windows ou uma alternativa equivalente. Sem nvm, ainda e possivel instalar manualmente a versao indicada em `.nvmrc`.

### package-lock ausente

O fluxo previsivel depende de lockfiles versionados. Se um lockfile estiver ausente, gere-o apenas quando houver decisao explicita de manutencao de dependencias.

### engine-strict bloqueando install

O bloqueio indica que Node/npm nao correspondem ao contrato de ambiente. Ajuste a versao local antes de instalar dependencias.

### Java/Graphviz ausentes

Java e Graphviz sao opcionais para renderizar UML/PlantUML. A ausencia deles deve gerar aviso, nao impedir o uso principal do sistema.
