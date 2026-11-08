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

## `smoke-identidade.js` (GS-03)

### Objetivo

Validar isolamento de identidade e escopo pela API: Matriz → Filial, Filial → Matriz, Rede A → Rede B, hierarquia de papéis, bloqueio de promoção a `platform_admin`, unidade obrigatória, revogação de sessão ao mudar unidades, auditoria e repetição após refresh de sessão.

### Pré-requisitos

- API rodando sobre base criada com `npm run db:seed:dev`. **Não rodar em base real**: o smoke cria a Rede B `smoke-identidade-rede-b` e usuários `smoke.*`.
- Senhas: `SEED_DEV_PASSWORD` (padrão `dev12345`) e `SMOKE_PLATFORM_PASSWORD` (padrão `BOOTSTRAP_ADMIN_PASSWORD` ou `admin123`).

### Execução

```cmd
node tests\scripts\smoke-identidade.js --base-url=http://localhost:3001
```

Rode de novo depois de reiniciar a API para cobrir o cenário de reinício. Exit code `0` passou, `1` falhou.

## `diagnostico-vinculos.js` (GS-03)

Diagnóstico **somente leitura** dos vínculos usuário ↔ Rede/Unidade. Abre o SQLite em modo leitura e lista vínculos de origem não confirmada, usuários em mais de uma Rede, mais de uma unidade padrão e usuários ativos sem unidade.

```cmd
node tests\scripts\diagnostico-vinculos.js [caminho\academia.sqlite]
```

Tratamento dos achados: `docs/governance/vinculos-escopo-legado.md`.

## `smoke-f0-acesso-datas.js` (GS-07 F0)

Valida em processo, com relógio fixo: P2 (mensalidade futura em aberto não esconde cobertura paga vigente; débito vencido, pré-pago e legado sem datas mantêm a regra atual), P9 (data local da operação, inclusive na virada das 21h de Brasília) e P10 (edição preserva cobertura e observações não enviadas). Use base descartável criada com `npm run db:seed:dev`; as fixtures `SMOKE_F0_*` são removidas no fim.

```cmd
node tests\scripts\smoke-f0-acesso-datas.js
```

## `smoke-p1-pagamentos.js` (GS-07 P1)

Valida pela API o pagamento parcial e o estorno por pagamento: mensalidade de R$ 80, paga 50 (saldo 30), 31 recusado, paga 30 (quitada), reenvio com a mesma chave sem duplicar, estorno dos 30 (volta a parcial, 50 pagos, 30 em aberto, mesma competência), 403 para quem não tem `reversao:executar`, 404 de outra unidade e concorrência (dois pagamentos simultâneos sobre o mesmo saldo; a mesma chave em paralelo). Com `--db`, confere também lançamentos, reversão e auditoria na base (somente leitura). Use base descartável criada com `npm run db:seed:dev` e a API rodando sobre ela.

```cmd
node tests\scripts\smoke-p1-pagamentos.js --base-url=http://localhost:3001 --db=backend\academia.sqlite
```

## `smoke-isolamento-transacao.js` (GS-07 P1.1)

Valida em processo que uma gravação de outra requisição fica fora da transação aberta: abre a transação, dispara uma gravação independente, força o rollback e confere que a independente persistiu. Cobre também leitura não confirmada, trabalho agendado após o commit, transações simultâneas e `runTransaction` aninhado. Usa só a tabela temporária `smoke_isolamento_tx`. Base descartável.

```cmd
node tests\scripts\smoke-isolamento-transacao.js
```

## `ui-p1-1-pagamento.py` (GS-07 P1.1)

Teste de tela (Playwright para Python) do botão de pagamento do perfil do aluno: clique duplo, resposta perdida por falha de rede e timeout do cliente. Em todos os casos deve existir um único pagamento e um único lançamento. Pré-requisitos e uso no cabeçalho do arquivo; o frontend precisa subir com `VITE_PAGAMENTO_TIMEOUT_MS=2000`.

