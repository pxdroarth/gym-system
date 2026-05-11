# Frontend - Sistema Academia SA

Frontend React + Vite do Sistema Academia SA.

## Instalar dependências

Dentro de `frontend`:

```bash
npm install
```

## Rodar em desenvolvimento

Dentro de `frontend`:

```bash
npm run dev
```

Comando equivalente:

```bash
npm start
```

Pela raiz do projeto:

```bash
npm run frontend
```

Porta esperada do Vite:

```text
http://localhost:5173
```

## API backend

O frontend consome a API Express em:

```text
http://localhost:3001
```

Se `VITE_API_URL` estiver definido, ele sobrescreve o endereço padrão usado pelo frontend.

## Variáveis locais observadas

Arquivo local existente:

```text
frontend/.env
```

Variáveis usadas pelo código:

- `VITE_API_URL`
- `VITE_DEV_AUTO_LOGIN`
- `VITE_DEV_LOGIN`
- `VITE_DEV_PASSWORD`
- `VITE_CONFIRM_MODE`
- `VITE_CONFIRM_TITLE`
- `VITE_CONFIRM_MESSAGE`
- `VITE_CONFIRM_OK`
- `VITE_CONFIRM_CANCEL`
- `VITE_CONFIRM_VARIANT`
- `VITE_ALUNOS_ORDER`

Não há `.env.example` no frontend no momento desta auditoria.

## Build e preview

```bash
npm run build
npm run preview
```

Este README é específico do frontend. A visão geral do projeto, governança, banco, backend e roadmap ficam no [README da raiz](../README.md).
