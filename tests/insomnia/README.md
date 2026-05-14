# Testes de API com Insomnia

## 1. Objetivo

Esta pasta guarda collections e ambientes de exemplo para validar a API localmente com Insomnia, sem depender de Postman/Newman nesta sprint.

## 2. Pré-requisitos

- Backend rodando em `http://localhost:3001`.
- Banco SQLite disponível.
- Insomnia instalado.
- Ambiente local configurado.
- Dados fictícios/teste.
- Usuário admin/bootstrap disponível.

## 3. Arquivos da pasta

- `sistema-academia-openapi.json`: mapa inicial de API em OpenAPI 3.0.3, importavel no Insomnia.
- `local-env.example.json`: exemplo seguro de variáveis.
- `sistema-academia-smoke.insomnia.json`: collection exportada do Insomnia, quando existir.
- `requests-map.md`: mapa documental dos requests recomendados.

Não commite environment com senha real, token real, cookie real ou qualquer segredo.

## 4. Importacao via OpenAPI JSON

1. Abrir Insomnia.
2. Importar o arquivo `tests/insomnia/sistema-academia-openapi.json`.
3. Criar environment local com base em `local-env.example.json`.
4. Preencher senha localmente.
5. Executar requests de Health/Auth primeiro.
6. Nao commitar environment com senha/token/cookie real.

O OpenAPI JSON funciona como mapa inicial de API para importacao e validacao manual. A collection real exportada do Insomnia ainda pode ser criada depois, e requests importados podem precisar de ajuste fino de body e environment.

## 5. Variáveis recomendadas

- `base_url`
- `unit_id`
- `login_admin`
- `senha_admin`
- `token_admin`
- `token_operador`

Use [local-env.example.json](local-env.example.json) como referência segura.

## 6. Ordem recomendada dos requests

1. `GET /test-db`
2. `POST /auth/login`
3. `GET /auth/me`
4. `POST /auth/refresh`
5. `GET /auth/me` com token antigo, esperado `401`
6. `GET /auth/me` com token novo, esperado `200`
7. `POST /auth/logout`
8. `POST /auth/logout-all`
9. `GET /audit-logs` com admin, esperado `200`
10. `GET /audit-logs` com operador, esperado `403`, quando houver token de operador

O refresh depende do cookie `academia_sa_refresh` salvo pelo Insomnia após o login.

## 7. Testes futuros

Pendentes para expansão:

- alunos
- mensalidades
- pagamentos
- produtos
- vendas
- acessos
- permissões por perfil
- financeiro restrito

## 8. Segurança

- Não exportar senha real.
- Não exportar token real.
- Não exportar cookie real.
- Não commitar ambiente pessoal.
- Usar `logout-all` ao final de testes sensíveis quando necessário.
