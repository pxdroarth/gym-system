# Ambiente Local - Sistema Academia SA

## 1. Objetivo

Este documento define a matriz oficial de ambiente suportado para desenvolvimento local do Sistema Academia SA.

O foco aqui e responder, de forma objetiva:

- o que e obrigatorio;
- o que e recomendado;
- o que e opcional ou futuro;
- qual e o fluxo curto esperado para preparar uma maquina nova.

O diagnostico oficial de ambiente e read-only:

```cmd
tests\scripts\env-doctor.cmd
```

Ele nao instala dependencias, nao altera arquivos e nao faz bootstrap automatico.

O bootstrap assistido de dependencias segue separado:

```cmd
tests\scripts\env-bootstrap.cmd
```

Por padrao ele roda em dry-run/plano, apenas mostra o que seria executado e so instala dependencias npm com flag explicita e confirmacao interativa.

## 2. Matriz oficial de ambiente suportado

### Obrigatorio

| Categoria | Requisito oficial | Observacoes |
|---|---|---|
| Sistema operacional | Windows | Plataforma primaria suportada para desenvolvimento local. |
| Shell | PowerShell 5.1+ | Necessario para os scripts oficiais em `tests\scripts`. |
| Versionamento | Git | Necessario para clonar, atualizar e versionar o repositorio. |
| Runtime | Node.js `>=20 <23` | Faixa declarada em `package.json` e `frontend/package.json`. |
| Gerenciador de pacotes | npm compativel com o Node instalado | O projeto declara `npm >=9`. |
| Dependencias do projeto | `node_modules` da raiz e `frontend/node_modules` | Instalacao manual, sem bootstrap automatico. |
| Estrutura local | repositorio com `backend`, `frontend` e `tests/scripts` | O doctor valida essa estrutura. |
| Banco local | SQLite local do projeto | Arquivo principal esperado em `backend/academia.sqlite`. |
| Ambiente | `backend/.env` e `frontend/.env`, quando exigidos pelo fluxo local | Nunca expor ou versionar secrets reais. |

### Recomendado

| Categoria | Recomendacao | Observacoes |
|---|---|---|
| Distribuicao Node | Node.js LTS compativel dentro da faixa `>=20 <23` | Reduz divergencia entre maquinas locais. |
| Validacao inicial | `tests\scripts\env-doctor.cmd` | Primeiro passo de diagnostico em maquina nova. |
| API manual | `curl.exe` | Usado em validacoes manuais e smoke tecnico rapido. |
| Dependencias nativas | Python 3 disponivel no PATH | Pode ser necessario ao reinstalar modulos nativos. |
| Toolchain nativa | Visual Studio Build Tools com C++ | Pode ser necessario ao recompilar dependencias como `sqlite3`. |
| Editor | VS Code ou equivalente | Nao obrigatorio, mas coerente com o fluxo atual. |

### Opcional / futuro

| Categoria | Status | Observacoes |
|---|---|---|
| `winget` | Opcional | Pode ajudar em instalacoes manuais, mas nao e requisito do projeto. |
| Playwright / E2E | Opcional / pausado | Nao bloqueia readiness local neste bloco. |
| Insomnia | Opcional | Util para API manual e semiautomatizada. |
| PlantUML / Java / Graphviz | Opcional | Necessarios apenas para diagramas locais. |
| k6 / JMeter | Futuro | Fora do gate principal atual. |

## 3. Dependencias tecnicas suportadas

### Sistema base

- Windows e o ambiente primario suportado.
- PowerShell 5.1 ou superior e necessario para:
  - `tests\scripts\env-doctor.cmd`
  - `tests\scripts\smoke-auth.cmd`
  - wrappers e scripts operacionais em `tests\scripts`
- Git e obrigatorio.
- `curl.exe` e recomendado para validacoes manuais de API.

### Node.js e npm

- Faixa oficial de Node.js: `>=20 <23`
- Compatibilidade oficial de npm: `>=9`
- O caminho recomendado para maquina nova e instalar um Node.js LTS compativel com essa faixa.
- O projeto nao deve assumir que Node/npm ja estejam presentes antes do doctor.

### Dependencias nativas potenciais

O ambiente atual pode exigir recompilacao de dependencias nativas ao reinstalar pacotes em uma maquina nova.

Casos detectados no projeto:

- `sqlite3`
- `node-gyp`

Implicacoes praticas:

- Python 3 pode ser necessario no PATH.
- Visual Studio Build Tools com C++ pode ser necessario.

Observacao importante:

- isso nao significa que toda maquina precisara recompilar binarios;
- significa apenas que o ambiente deve estar preparado caso a reinstalacao local exija esse passo.

### SQLite local

Banco local esperado:

- principal: `backend/academia.sqlite`
- legado ou auxiliar possivel: `backend/seubanco.db`

Regras:

- nao inspecionar nem imprimir dados do banco em documentacao;
- tratar o banco local como ambiente de desenvolvimento/demo;
- o backend executa `ensureSchema` na inicializacao.

### Arquivos `.env`

Arquivos relevantes:

- `backend/.env`
- `backend/.env.example`
- `frontend/.env`
- `frontend/.env.example`

Regras:

- nunca expor secrets;
- nunca versionar credenciais reais;
- usar os arquivos `.env.example` como referencia para montagem manual do ambiente;
- o backend atual nao deve ser tratado como bootstrap automatico de configuracao;
- a documentacao nao assume criacao automatica de `.env`.

### Portas padrao

| Escopo | Porta padrao |
|---|---|
| Backend | `3001` |
| Frontend Vite | `3000` |

Se a porta estiver ocupada:

- revisar o processo atual;
- nao matar processo automaticamente;
- ajustar o ambiente manualmente.

## 4. Comandos oficiais do ambiente local

### Diagnostico read-only

```cmd
tests\scripts\env-doctor.cmd
```

### Bootstrap assistido

Dry-run padrao:

```cmd
tests\scripts\env-bootstrap.cmd
```

Instalacao assistida das dependencias npm do projeto:

```cmd
tests\scripts\env-bootstrap.cmd -InstallDeps
```

Esse fluxo pode executar somente:

- `npm.cmd install`
- `npm.cmd --prefix frontend install`

### Smoke de autenticacao

```cmd
tests\scripts\smoke-auth.cmd -Login admin
```

### Smoke de acesso

```cmd
tests\scripts\smoke-acesso.cmd
```

### Build oficial do frontend

```cmd
npm.cmd --prefix frontend run build
```

### Gate principal atual

O gate principal atual de readiness local permanece:

- `tests\scripts\smoke-auth.cmd`
- `tests\scripts\smoke-acesso.cmd`
- `npm.cmd --prefix frontend run build`

Playwright / E2E ficam como opcionais e pausados neste momento. Eles nao sao gate obrigatorio deste bloco.

## 5. Fluxo recomendado para maquina nova

1. Clonar o repositorio com Git.
2. Instalar manualmente um Node.js LTS compativel com `>=20 <23`.
3. Instalar as dependencias declaradas:

```cmd
npm.cmd install
npm.cmd --prefix frontend install
```

4. Configurar os arquivos `.env` necessarios a partir dos exemplos, sem copiar secrets reais para o repositorio.
5. Rodar o doctor read-only:

```cmd
tests\scripts\env-doctor.cmd
```

6. Rodar o gate principal:

```cmd
tests\scripts\smoke-auth.cmd -Login admin
tests\scripts\smoke-acesso.cmd
npm.cmd --prefix frontend run build
```

Observacoes:

- este fluxo nao instala nada automaticamente;
- este fluxo nao executa bootstrap destrutivo;
- ajustes de automacao de setup ficam para bloco futuro.

## 6. Leitura objetiva de readiness

Use esta regra pratica:

- `Obrigatorio` ausente ou quebrado: ambiente nao esta pronto.
- `Recomendado` ausente: ambiente pode funcionar, mas com risco maior de atrito local.
- `Opcional / futuro` ausente: nao bloqueia readiness atual.

O `env-doctor` e a referencia inicial para essa leitura.

## 7. Troubleshooting curto

### Node ou npm ausente

- instalar manualmente Node.js LTS compativel;
- abrir um novo terminal;
- rodar novamente `tests\scripts\env-doctor.cmd`.

### `node_modules` ausente

Executar manualmente:

```cmd
npm.cmd install
npm.cmd --prefix frontend install
```

### Dependencia nativa falhando na reinstalacao

Revisar:

- Python no PATH;
- Visual Studio Build Tools com C++;
- compatibilidade do Node com a faixa `>=20 <23`.

### Banco local nao encontrado

- confirmar a presenca de `backend/academia.sqlite`;
- iniciar o backend manualmente quando necessario;
- validar `/test-db` depois que a API estiver de pe.

### `.env` ausente

- usar `backend/.env.example` e `frontend/.env.example` como referencia;
- criar `.env` manualmente;
- nunca copiar secrets reais para documentacao ou para o repositorio.

