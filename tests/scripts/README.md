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

## `smoke-acesso.js`

### Objetivo

Validar a regra critica de acesso/mensalidade do DOM-ACESSO-01 sem depender do frontend nem de senha real.

### Pre-requisitos

- Node.js disponivel.
- Dependencias ja instaladas na raiz do projeto.
- Banco SQLite local/demo disponivel.
- Usar somente em ambiente local/demo, nunca em producao.

### Execucao

```cmd
tests\scripts\smoke-acesso.cmd
```

Alternativa direta com Node:

```cmd
node tests\scripts\smoke-acesso.js
```

### Fixtures

- O teste cria tenant, unidade, plano, alunos, mensalidades, acessos e auditoria com prefixo `SMOKE_ACESSO_`.
- A limpeza antes/depois remove apenas registros associados a esse prefixo e aos alunos criados pelo teste.
- O script nao altera schema, nao cria migration e nao usa dados reais.

### Validacoes feitas

- aluno ativo sem mensalidade bloqueado.
- mensalidade vencida bloqueada.
- mensalidade parcial vencida bloqueada.
- mensalidade parcial dentro do prazo bloqueada por ausencia de cobertura paga vigente.
- mensalidade em aberto dentro do prazo bloqueada por ausencia de cobertura paga vigente.
- vencimento no dia atual com mensalidade em aberto bloqueado por ausencia de cobertura paga vigente.
- mensalidade paga liberada.
- `POST /acessos` comum nao burla a regra.
- liberacao manual sem motivo bloqueada.
- liberacao manual com motivo/operador auditada em `audit_log`.
- `PUT /acessos/:id` bloqueado com `ACESSO_REGISTRO_IMUTAVEL`.
- `DELETE /acessos/:id` bloqueado com `ACESSO_REGISTRO_IMUTAVEL`.

## `reset-admin-password.js`

### Objetivo

Resetar senha de usuario interno/admin no SQLite local usando o mesmo hash do AuthService.

### Uso seguro (somente local/admin)

```cmd
tests\scripts\reset-admin-password.cmd admin
```

- Informe a nova senha apenas no prompt interativo do terminal.
- Nunca passe senha por argumento.
- Nunca commitar senha real.
- O script revoga sessoes/tokens ativos do usuario informado.
- Ao finalizar, execute `tests\scripts\smoke-auth.cmd` para validar o login.

## Diagnostico de consistencia operacional

### `diagnostico-consistencia.js`

Objetivo:
inspecionar o banco SQLite local real em modo somente leitura para procurar inconsistencias entre cobertura, mensalidade, pagamento, plano e financeiro.

Execucao:

```cmd
tests\scripts\diagnostico-consistencia.cmd
```

Observacoes:

- abre o SQLite com `sqlite3.OPEN_READONLY`
- nao altera dados
- nao executa `INSERT`, `UPDATE` ou `DELETE`
- nao sincroniza financeiro
- nao cria mensalidade
- nao registra pagamento
- pode retornar achados informativos esperados, como aluno `AVULSO_MENSAL` ativo sem cobertura paga vigente
- achados `critico` ou `alto` indicam inconsistencia que exige revisao operacional

### `smoke-diagnostico-consistencia.js`

Objetivo:
testar o proprio diagnostico, validando se ele detecta inconsistencias controladas.

Execucao:

```cmd
tests\scripts\smoke-diagnostico-consistencia.cmd
```

Observacoes:

- cria uma copia temporaria do banco local
- injeta inconsistencias controladas apenas nessa copia
- roda o diagnostico contra a copia temporaria
- valida se checks `critico` e `alto` sao detectados
- remove os arquivos temporarios ao final
- nao altera o banco real

### Diferenca entre os comandos

- `diagnostico-consistencia`: inspeção read-only do banco real local
- `smoke-diagnostico-consistencia`: teste automatizado do proprio diagnostico

### Regras de seguranca

- nenhum dos dois corrige dados
- nenhum dos dois e scheduler
- nenhum dos dois e `node-cron`
- nenhum dos dois gera mensalidades
- nenhum dos dois sincroniza financeiro
- nenhum dos dois deve ser confundido com reconciliacao automatica

### Quando usar

- apos mudancas em mensalidades, pagamentos, financeiro, cobertura ou planos
- antes de criar scheduler futuro
- antes ou depois de manutencao operacional sensivel
- como apoio a auditoria local
