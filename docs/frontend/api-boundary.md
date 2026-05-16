# Fronteira do Api.js - Frontend

## 1. Objetivo

Definir a fronteira arquitetural do frontend para que `Api.js` permaneça como infraestrutura HTTP central, sem uso direto por páginas e componentes.

## 2. Regra principal

- Páginas e componentes devem usar services por domínio.
- Services podem usar `Api.js`.
- `Api.js` deve concentrar `axios`, interceptors, auth header, refresh e flags internas.
- Auth/session deve continuar isolado em `authService`/`AuthContext` até o Bloco 4.

## 3. O que permanece em Api.js

- instância `axios`
- `baseURL`
- `withCredentials`
- request interceptor
- response interceptor
- refresh single-flight
- flags `_skipAuthHeader`, `_skipAuthRefresh`, `_retry`
- exports legados temporários para compatibilidade

## 4. Services por domínio

- `alunoService`
- `planoService`
- `planoAssociadoService`
- `mensalidadeService`
- `pagamentoService`
- `acessoService`
- `produtoService`
- `vendaProdutoService`
- demais services já existentes: `authService`, `auditLogService`, `tenantService`, `onboardingService`, `usuariosInternosService`, `dashboardService`, `contasFinanceiras`, `planoContasService`

## 5. Regra para novos códigos

- não importar diretamente de `services/Api` em `pages/components`
- criar ou usar service de domínio
- não criar nova instância `axios`
- não duplicar `baseURL`
- não ler cookie HttpOnly por JavaScript
- não montar `Authorization` manualmente fora do padrão

## 6. Exceções permitidas

Exceções devem ser raras e justificadas:

- `authService`/`AuthContext`, quando necessário para sessão
- testes técnicos
- infraestrutura HTTP
- casos documentados em auditoria/plano

## 7. Pendências futuras

- remover exports legados do `Api.js` quando todos os services tiverem implementação própria
- mover implementações de domínio para dentro dos services gradualmente
- Bloco 4: access token em memória
- Playwright/E2E depois do Bloco 4
