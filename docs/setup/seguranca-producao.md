# Seguranca de Producao

## 1. Objetivo

Este guia registra a configuracao minima de seguranca para preparar o Sistema Academia SA para deploy web sem quebrar o uso local em `localhost`.

## 2. CORS

O backend usa CORS com credenciais porque o refresh token fica em cookie HttpOnly.

Em desenvolvimento, quando `CORS_ORIGINS` e `FRONTEND_URL` nao estao definidos, as origens permitidas sao:

- `http://localhost:3000`
- `http://localhost:5173`

Em producao, defina pelo menos uma origem explicita:

```env
NODE_ENV=production
CORS_ORIGINS=https://app.seu-dominio.com
```

Tambem e possivel usar:

```env
FRONTEND_URL=https://app.seu-dominio.com
```

Nao use `*` com `credentials: true`. O backend bloqueia essa configuracao.

## 3. Cookies

O cookie de refresh `academia_sa_refresh` permanece:

- `HttpOnly`
- `path=/auth`
- com expiracao baseada em `AUTH_REFRESH_TOKEN_TTL_DAYS`
- inacessivel por JavaScript

Defaults:

- desenvolvimento: `Secure=false`, `SameSite=Lax`
- producao: `Secure=true`, `SameSite=Lax`

Variaveis:

```env
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
```

Use `COOKIE_SAME_SITE=none` apenas quando o deploy exigir contexto cross-site real e sempre com HTTPS. O backend forca `Secure=true` quando `SameSite=None`.

## 4. HTTPS e proxy

Producao deve rodar atras de HTTPS. O backend ativa `trust proxy = 1` em `NODE_ENV=production`, adequado para reverse proxy ou plataforma cloud confiavel.

Em desenvolvimento local, HTTPS nao e obrigatorio e o cookie pode funcionar sem `Secure`.

## 5. Headers de seguranca

O backend aplica headers minimos em todas as respostas:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`

Como o backend e API, a CSP e conservadora. A CSP final do frontend/deploy estatico deve ser revisada quando a hospedagem web for definida.

## 6. Variaveis principais

Backend:

- `NODE_ENV`
- `PORT`
- `CORS_ORIGINS`
- `FRONTEND_URL`
- `COOKIE_SECURE`
- `COOKIE_SAME_SITE`
- `TRUST_PROXY`
- `AUTH_ACCESS_TOKEN_TTL_MINUTES`
- `AUTH_REFRESH_TOKEN_TTL_DAYS`
- `BOOTSTRAP_ADMIN_PASSWORD`

Frontend:

- `VITE_API_URL`

Nao commite `.env` real, senha, token, cookie ou segredo.

## 7. Diferencas dev/prod

Desenvolvimento:

- aceita `localhost:3000` e `localhost:5173` por padrao
- nao exige HTTPS
- refresh cookie pode usar `Secure=false`

Producao:

- exige origem CORS explicita
- exige HTTPS
- usa refresh cookie com `Secure=true`
- deve apontar `VITE_API_URL` para a API HTTPS publica

## 8. Pendencias antes de producao comercial

- Definir dominio final do frontend e da API.
- Definir plataforma de deploy e proxy.
- Revisar CSP final do frontend hospedado.
- Configurar HTTPS e certificados.
- Revisar CORS por ambiente.
- Separar dados ficticios/teste de qualquer dado real.
- Planejar PostgreSQL e estrategia de backup.
