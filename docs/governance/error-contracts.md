# Contratos de Erro — Inventário Atual

## Objetivo

Mapear os formatos de erro atualmente usados no backend antes de qualquer padronização futura.

## Padrões encontrados

### 1. AppError + errorHandler global

Usado por fluxos mais novos/centralizados que chamam `next(error)` ou lançam `new AppError(...)`.

Payload atual:

```json
{
  "error": "mensagem de erro",
  "ok": false,
  "code": "CODIGO_DE_DOMINIO",
  "details": null
}
```

Origem principal:
- [backend/middlewares/errorHandler.js](/C:/sistema-academia-main/backend/middlewares/errorHandler.js)
- [backend/errors/AppError.js](/C:/sistema-academia-main/backend/errors/AppError.js)

Exemplos de uso:
- `backend/routes/acessos.js`
- `backend/routes/auth.js`
- `backend/routes/usuariosInternos.js`
- `backend/routes/units.js`
- vários services em `backend/services/*`

### 2. Fallback 404 global

Usado para rotas inexistentes após o registro de todas as rotas.

Payload atual:

```json
{
  "success": false,
  "error": "not_found",
  "message": "Rota não encontrada.",
  "correlation_id": "..."
}
```

Origem principal:
- [backend/server.js](/C:/sistema-academia-main/backend/server.js)

### 3. Erro interno 500 global

Usado para exceções não tratadas pelo `AppError`.

Payload atual:

```json
{
  "success": false,
  "error": "internal_server_error",
  "message": "Erro interno do servidor.",
  "correlation_id": "..."
}
```

Origem principal:
- [backend/middlewares/errorHandler.js](/C:/sistema-academia-main/backend/middlewares/errorHandler.js)

Observação:
- o log interno já registra `correlation_id` via `console.error` estruturado
- stack trace não é exposta ao cliente

### 4. Erros manuais por rota

Ainda existem várias rotas retornando erro diretamente com `res.status(...).json(...)`, sem passar pelo `AppError`.

Formatos encontrados:

```json
{ "error": "..." }
{ "erro": "..." }
{ "erro": "...", "detalhes": "..." }
{ "message": "..." }
{ "ok": false, "error": "...", "code": "..." }
```

Exemplos representativos:
- `backend/routes/alunos.js`
- `backend/routes/planos.js`
- `backend/routes/produtos.js`
- `backend/routes/planoContas.js`
- `backend/routes/ativos.js`
- `backend/routes/orcamento.js`
- `backend/routes/contasFinanceiras.js`
- `backend/routes/vendasProdutos.js`

### 5. Respostas 401 manuais ligadas a auth/contexto

Algumas rotas retornam 401 diretamente a partir de `req.authError` ou ausência de operador autenticado.

Payload típico:

```json
{
  "ok": false,
  "error": "mensagem",
  "code": "CODIGO_AUTH"
}
```

Exemplos:
- `backend/routes/auth.js`
- `backend/routes/units.js`
- `backend/routes/usuariosInternos.js`

## Campos hoje em circulação

- `ok`
- `success`
- `code`
- `error`
- `message`
- `details`
- `correlation_id`
- `erro`
- `detalhes`

## Riscos de compatibilidade numa padronização futura

- Frontend atual pode depender de mais de um formato de erro.
- Algumas rotas ainda usam `error`, outras usam `erro`.
- Algumas respostas operacionais usam `ok/code/details`, enquanto 404 e 500 usam `success/message/correlation_id`.
- Há respostas manuais que incluem `err.message` diretamente, o que pode expor detalhe interno em certos fluxos antigos.
- Mudança global sem inventário por consumidor pode quebrar telas, `getApiErrorMessage` e smoke tests.

## Estratégia incremental recomendada

1. Congelar o inventário atual e identificar consumidores frontend por domínio.
2. Priorizar padronização em rotas que já usam `next(error)` e `AppError`.
3. Migrar erros manuais antigos por bloco de domínio, sem lote único.
4. Definir um contrato-alvo único para erros operacionais e internos.
5. Só depois avaliar alinhar 401/403/404 antigos e remover formatos `erro/detalhes`.
