# Fronteira do Api.js - Frontend

## 1. Objetivo

Explicar que `Api.js` e a infraestrutura HTTP central e nao deve ser usado diretamente por paginas/componentes.

## 2. Regra principal

- Paginas e componentes devem usar services por dominio.
- Services podem usar `Api.js`.
- `Api.js` deve concentrar `axios`, interceptors, auth header, refresh e flags internas.
- Auth/session continua isolado em `authService`/`AuthContext`.
- Access token deve ficar somente em memoria; reload depende do refresh cookie HttpOnly.

## 3. O que permanece em Api.js

- instancia `axios`
- `baseURL`
- `withCredentials`
- request interceptor
- response interceptor
- refresh single-flight
- flags `_skipAuthHeader`, `_skipAuthRefresh`, `_retry`
- access token em memoria via `authStorage`
- exports legados temporarios, enquanto existirem

## 4. Services por dominio

- `alunoService`
- `planoService`
- `planoAssociadoService`
- `mensalidadeService`
- `pagamentoService`
- `acessoService`
- `produtoService`
- `vendaProdutoService`
- demais services ja existentes: `authService`, `auditLogService`, `tenantService`, `onboardingService`, `usuariosInternosService`, `dashboardService`, `contasFinanceiras`, `planoContasService`

## 5. Regra para novos codigos

- nao importar diretamente de `services/Api` em `pages/components`
- criar ou usar service de dominio
- nao criar nova instancia `axios`
- nao duplicar `baseURL`
- nao ler cookie HttpOnly por JS
- nao montar `Authorization` manualmente fora do padrao
- nao persistir bearer token em `localStorage` ou `sessionStorage`

## 6. Excecoes permitidas

Excecoes devem ser raras e justificadas:

- `authService`/`AuthContext`, se necessario
- testes tecnicos
- infraestrutura HTTP
- casos documentados

## 7. Pendencias futuras

- remover exports legados do `Api.js` quando todos os services tiverem implementacao propria
- mover implementacoes de dominio para dentro dos services gradualmente
- Bloco 5: hardening de producao com cookie Secure, HTTPS, CSP e CORS por ambiente
- Playwright/E2E depois do Bloco 4
