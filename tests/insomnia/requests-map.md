# Mapa de Requests — Insomnia

## 1. Health

### GET /test-db

- Método: `GET`
- URL: `{{ base_url }}/test-db`
- Headers: nenhum obrigatório
- Body: nenhum
- Resultado esperado: `200` com JSON contendo `db_time`

## 2. Auth

### POST /auth/login

- Método: `POST`
- URL: `{{ base_url }}/auth/login`
- Body JSON:

```json
{
  "login": "{{ login_admin }}",
  "senha": "{{ senha_admin }}"
}
```

- Resultado esperado: `200`, `ok: true`, `data.token` e cookie `academia_sa_refresh`
- Observação: copiar token para `token_admin` se não houver script automático.

### GET /auth/me

- Método: `GET`
- URL: `{{ base_url }}/auth/me`
- Headers:
  - `Authorization: Bearer {{ token_admin }}`
  - `X-Unit-Id: {{ unit_id }}`
- Resultado esperado: `200`, `ok: true`, dados do operador autenticado

### POST /auth/refresh

- Método: `POST`
- URL: `{{ base_url }}/auth/refresh`
- Headers: nenhum obrigatório além do cookie mantido pelo Insomnia
- Body: nenhum
- Resultado esperado: `200`, novo `data.token` e novo cookie de refresh
- Observação: depende do cookie `academia_sa_refresh` salvo pelo Insomnia.

### POST /auth/logout

- Método: `POST`
- URL: `{{ base_url }}/auth/logout`
- Headers:
  - `Authorization: Bearer {{ token_admin }}`
  - `X-Unit-Id: {{ unit_id }}`
- Resultado esperado: `200`, sessão atual revogada e cookie limpo

### POST /auth/logout-all

- Método: `POST`
- URL: `{{ base_url }}/auth/logout-all`
- Headers:
  - `Authorization: Bearer {{ token_admin }}`
  - `X-Unit-Id: {{ unit_id }}`
- Resultado esperado: `200`, sessões ativas do usuário encerradas

## 3. Auditoria

### GET /audit-logs

- Método: `GET`
- URL: `{{ base_url }}/audit-logs`
- Headers:
  - `Authorization: Bearer {{ token_admin }}`
  - `X-Unit-Id: {{ unit_id }}`
- Resultado esperado com admin: `200`, `ok: true`, lista paginada de logs dentro do escopo permitido
- Resultado esperado com operador: `403`, quando o perfil não tiver permissão de consulta ao histórico

## 4. Domínios futuros

Placeholders documentais para expansão futura:

- alunos
- mensalidades
- pagamentos
- produtos
- vendas
- acessos
