# Versoes de Ambiente - Sistema Academia SA

## 1. Objetivo

Este documento padroniza versoes globais e valida o setup inicial do Sistema Academia SA em PCs locais, especialmente no fluxo Windows com CMD/PowerShell.

## 2. Node.js

- Node suportado: `>=20 <23`.
- Node recomendado e testado atualmente: `22.19.0`.
- `.nvmrc` indica a versao recomendada, nao a unica versao aceita.
- O arquivo `.node-version` espelha exatamente o conteudo da `.nvmrc`.
- `package.json` e `frontend/package.json` indicam a faixa suportada em `engines.node`.
- Use `nvm` para trocar a versao antes de instalar dependencias.
- No Windows, use NVM for Windows ou alternativa equivalente para selecionar a versao indicada.

Exemplo:

```cmd
nvm install
nvm use
```

Se sua ferramenta nao ler `.nvmrc` automaticamente, abra o arquivo e use a versao indicada manualmente.

## 3. npm

- npm suportado: `>=9`.
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

## 6. Fluxo recomendado em PC novo

1. Clonar repositorio.
2. Instalar/usar Node da `.nvmrc`, ou outra versao dentro da faixa suportada `>=20 <23`.
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

## 7. Ferramentas opcionais

- Java e Graphviz para PlantUML.
- Insomnia para API.
- Playwright futuro.
- k6/JMeter futuro.

Java e Graphviz nao sao obrigatorios para rodar backend, frontend ou SQLite local; eles ajudam apenas em fluxos de diagramas PlantUML.

## 8. Troubleshooting

### Node incompatibil

Confira `.nvmrc`, instale a versao indicada com NVM for Windows ou equivalente e rode `tests\scripts\check-versions.cmd` de novo.

Node 18 ou menor nao e suportado. Node 23 ou maior tambem nao e suportado nesta padronizacao.

### npm incompatibil

Atualize ou selecione uma instalacao do Node que traga npm dentro da faixa declarada em `engines`.

### nvm nao instalado

Instale NVM for Windows ou uma alternativa equivalente. Sem nvm, ainda e possivel instalar manualmente a versao indicada em `.nvmrc`.

### package-lock ausente

O fluxo previsivel depende de lockfiles versionados. Se um lockfile estiver ausente, gere-o apenas quando houver decisao explicita de manutencao de dependencias.

### engine-strict bloqueando install

O bloqueio indica que Node/npm nao correspondem ao contrato de ambiente. Ajuste a versao local antes de instalar dependencias.

### Java/Graphviz ausentes

Java e Graphviz sao opcionais para renderizar UML/PlantUML. A ausencia deles deve gerar aviso, nao impedir o uso principal do sistema.
