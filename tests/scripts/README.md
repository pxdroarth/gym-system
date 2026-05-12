# Scripts de Teste

Os scripts PowerShell/CMD são os primeiros testes automatizados do projeto. Eles servem para smoke rápido e validação local repetível.

Eles não substituem Playwright, Insomnia, k6 ou JMeter; cada ferramenta cobre uma camada diferente da qualidade.

## `smoke-auth.ps1`

### Objetivo

Validar rapidamente o fluxo crítico de autenticação backend do Sistema Academia SA.

### Pré-requisitos

- Backend rodando em `http://localhost:3001`, salvo uso de `-BaseUrl`.
- Usuário local válido.
- PowerShell disponível no Windows.
- Banco SQLite local e dados fictícios/teste preparados.

### Execução

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -Login admin
```

Se `-Senha` não for informado, o script solicita a senha no terminal.

Exemplo completo:

```powershell
powershell -ExecutionPolicy Bypass -File tests\scripts\smoke-auth.ps1 -BaseUrl "http://localhost:3001" -Login admin -Senha "SUA_SENHA" -UnitId 1
```

### Parâmetros

- `BaseUrl`: URL base da API. Padrão: `http://localhost:3001`.
- `Login`: login do usuário que executará o smoke. Obrigatório.
- `Senha`: senha do usuário. Opcional; se ausente, o script solicita no terminal.
- `UnitId`: unidade enviada em `X-Unit-Id`. Padrão: `1`.

### Resultado

- `exit code 0`: passou.
- `exit code 1`: falhou.

### Validações feitas

- `/test-db`
- login
- cookie HttpOnly
- `/auth/me`
- refresh
- token antigo inválido
- logout
- logout-all
