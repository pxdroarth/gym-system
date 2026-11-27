# Testes E2E

O Playwright usa o frontend e a API reais. O runner prepara um SQLite descartável com dados fictícios, inicia os serviços em portas locais e remove a base ao terminar.

## Execução local

Na raiz do repositório, com Node 24.22.3, dependências instaladas no backend e no frontend e PowerShell 7, instale o Chromium uma vez com `npx.cmd playwright install chromium`.

```powershell
# Um cenário pelo título no módulo de vendas
./tests/scripts/smoke-sqlite.ps1 -Playwright -PlaywrightFiles vendas.spec.js -PlaywrightGrep 'operador de acesso'

# Todo o módulo de vendas, incluindo pagamento dividido e devolução por meio
./tests/scripts/smoke-sqlite.ps1 -Playwright -PlaywrightFiles vendas.spec.js,vendas-pagamento.spec.js

# Estorno de pagamento do aluno (perfil, fila do Financeiro e celular)
./tests/scripts/smoke-sqlite.ps1 -Playwright -PlaywrightFiles estorno-pagamento.spec.js

# Pendências por estorno e contato com o aluno (Dashboard, perfil, e-mail e celular)
./tests/scripts/smoke-sqlite.ps1 -Playwright -PlaywrightFiles pendencias.spec.js

# Suíte crítica, igual à execução automática do PR
./tests/scripts/smoke-sqlite.ps1 -Playwright -PlaywrightFiles auth.spec.js,vendas.spec.js,vendas-pagamento.spec.js,estorno-pagamento.spec.js,pendencias.spec.js

# Suíte completa
./tests/scripts/smoke-sqlite.ps1 -Playwright
```

`-PlaywrightGrep` aceita uma expressão regular sobre o título do teste. `-PlaywrightFiles` aceita uma lista de filtros de arquivo. Use um cenário para iterar sobre um defeito conhecido e o módulo inteiro para conferir o fluxo junto às recusas. Amplie para a suíte completa ao mudar login, refresh ou logout, permissões por perfil ou troca de unidade. Esses ajustes podem afetar a autenticação, o acesso ao cadastro e o estoque de outra unidade.

O relatório local fica em `tests/e2e/playwright-report/`. Em caso de falha, os resultados podem incluir captura e trace em `tests/e2e/results/`.

## Pull requests

**Playwright E2E**, no workflow **Node 24**, executa automaticamente `auth.spec.js`, `vendas.spec.js`, `vendas-pagamento.spec.js`, `estorno-pagamento.spec.js` e `pendencias.spec.js` em PRs abertos, reabertos ou atualizados que estejam prontos para revisão. O evento `ready_for_review` inicia a execução quando o PR sai do rascunho, inclusive sem novo push. O job faz checkout do SHA de origem do PR recebido no evento e verifica o `HEAD` antes de instalar as dependências. Em **Details**, confira a etapa **Verify checked-out commit** e o resultado dos testes para o commit atual. O job **validate** continua executando os smokes de API e o build nos PRs.

## Rodada completa antes do merge

Com o disparo manual disponível na branch padrão, abra **Actions → Node 24 → Run workflow**, selecione `main` e informe o número do PR em `pr_number`. A seleção de `main` carrega a definição do workflow. O job **Playwright E2E completo** consulta o SHA atual do PR, faz checkout desse commit e roda todos os arquivos da suíte.

Também é possível disparar pelo GitHub CLI, trocando 123 pelo número do PR.

```powershell
gh workflow run node24.yml --ref main -f pr_number=123
```

Confira o número do PR e o SHA no resumo da execução antes de usar o resultado para a rodada final. Se o PR receber outro commit, dispare a suíte completa novamente.
