# Ambiente Local — Sistema Academia SA

## 1. Objetivo

Este guia mostra como preparar um PC novo para rodar o Sistema Academia SA localmente, validar a instalação básica e seguir para os smoke tests já documentados.

## 2. Pré-requisitos obrigatórios

- Git.
- Node.js.
- npm.
- VS Code recomendado.
- PowerShell no Windows.

## 3. Instalação do projeto

Antes de instalar dependencias, valide as versoes globais de Node/npm/Git conforme [Versoes de Ambiente](versoes-ambiente.md):

```cmd
tests\scripts\check-versions.cmd
```

Na raiz:

```bash
npm install
```

Depois:

```bash
cd frontend
npm install
cd ..
```

## 4. Backend

Na raiz:

```bash
npm run backend
```

Ou:

```bash
node backend/server.js
```

Endpoint de teste:

```text
http://localhost:3001/test-db
```

## 5. Frontend

Na raiz:

```bash
npm run frontend
```

Ou:

```bash
cd frontend
npm run dev
```

URL local esperada:

```text
http://localhost:5173
```

## 6. Arquivos de ambiente

Exemplos disponíveis:

- `backend/.env.example`
- `frontend/.env.example`

Não commite `.env` real, senha, token, cookie ou qualquer segredo.

O backend atual não carrega `.env` automaticamente por código se `dotenv` não estiver configurado. No estado atual do projeto, variáveis do backend precisam ser definidas no shell/processo quando necessário.

Segurança dev/prod:

- Em desenvolvimento, o backend aceita CORS para `http://localhost:3000` e `http://localhost:5173` quando nenhuma origem é configurada.
- Em produção, defina `CORS_ORIGINS` ou `FRONTEND_URL` com origem HTTPS explícita.
- O refresh cookie é `HttpOnly`; em produção usa `Secure=true`.
- Consulte [Segurança de Produção](seguranca-producao.md) antes de deploy web.

## 7. Validação automática do ambiente

Use:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\check-env.ps1
```

O script verifica ferramentas essenciais, arquivos esperados, dependências instaladas e se o backend responde em `/test-db`.

## 8. Smoke test de autenticação

Use:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -Login admin
```

A senha é solicitada no terminal se não for passada por parâmetro.

## 9. Ferramentas opcionais

- Insomnia para API.
- PlantUML + Java + Graphviz para diagramas.
- Playwright para E2E futuro.
- k6/JMeter para carga futura.

## 10. Troubleshooting

### Backend desligado

Rode:

```bash
npm run backend
```

ou:

```bash
node backend/server.js
```

### Porta 3001 ocupada

Encerre o processo que já usa a porta `3001` antes de iniciar o backend.

### Frontend não sobe

Confirme `npm install` dentro de `frontend` e rode `npm run dev`.

### `npm install` não executado

Execute a instalação na raiz e em `frontend` antes de rodar o sistema.

### Banco SQLite limpo

O backend executa bootstrap/`ensureSchema` na inicialização. Em ambiente limpo, confirme `/test-db` depois de iniciar a API.

### Senha admin incorreta

Use credenciais locais válidas. Não coloque senha real em arquivo versionado.

Para resetar a senha do admin local com o mesmo hash usado pelo backend, use:

```cmd
tests\scripts\reset-admin-password.cmd admin
```

Informe a nova senha apenas no prompt interativo. Depois valide:

```cmd
tests\scripts\smoke-auth.cmd -Login admin
```

### PowerShell bloqueando script

Execute com:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\check-env.ps1
```
