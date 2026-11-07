# Vínculos de escopo legados (usuário ↔ Rede/Unidade)

## 1. Contexto

Até a GS-03, o backend criava vínculo automático do usuário com a Unidade Matriz da Rede bootstrap (`documento = bootstrap-local`) em cinco pontos: a cada boot (`ensureExistingUserScopes`), no login, em toda resolução de sessão, no refresh e na criação de usuário (`UnitService.ensureUserDefaultScope`). Com isso, qualquer usuário de qualquer Rede ganhava acesso à Matriz da Rede bootstrap, e um usuário só da Filial também enxergava a Matriz.

A GS-03 removeu esses pontos. A partir dela:

- o vínculo só nasce de uma ação explícita, com `usuario_unit.origem` preenchida: `bootstrap` (admin inicial), `migracao_legado`, `onboarding`, `usuarios_internos`, `seed_dev` ou `confirmado_manual`;
- o backfill para a Matriz só roda na migração de uma base anterior ao modelo multiunidade (tabela `usuario_unit` criada naquele boot) e só para usuários sem nenhum vínculo;
- **nenhum vínculo existente é apagado ou alterado automaticamente.**

## 2. O problema

Em bases criadas antes da GS-03, todo vínculo tem `origem = NULL`. Não dá para provar se ele foi criado de propósito (seed, onboarding, cadastro pela tela) ou pelo vínculo automático. Apagar todos tiraria acessos legítimos; manter todos preserva acessos indevidos.

## 3. Regra adotada

1. Vínculos com `origem = NULL` continuam **válidos** até revisão humana. Isso preserva a operação de quem já usa o sistema.
2. A revisão é feita por quem responde pela Rede (`owner`) ou pela plataforma, nunca automaticamente.
3. Toda decisão passa pela tela Usuários (`PATCH /usuarios-internos/:id/unidades`). Assim ela fica auditada (`alterar_unidades_usuario`), e as sessões do usuário são revogadas quando o acesso muda.
4. Remover não apaga: o vínculo fica `status = 'inativo'`, preservando o histórico.
5. Manter um vínculo antigo ao salvar registra `origem = 'confirmado_manual'`.

## 4. Procedimento

1. Faça backup da base (`backend/scripts/backupManual.js`).
2. Suba a API uma vez com o código da GS-03. Isso adiciona as colunas `origem`, `created_by`, `updated_at` e `updated_by` sem mexer nos dados.
3. Rode o diagnóstico, que é somente leitura:

   ```cmd
   node tests\scripts\diagnostico-vinculos.js
   ```

   Prioridades:

   | Prioridade | Situação | Leitura provável |
   |---|---|---|
   | ALTA | origem desconhecida e usuário em mais de uma Rede, ou com mais de uma unidade padrão | Vínculo automático antigo. O vínculo automático sempre gravava `is_default = 1`, inclusive para quem já tinha outra unidade padrão. |
   | MÉDIA | sem vínculo ativo com a Rede da unidade | A unidade não vale mais para o usuário. Confirme se ele deveria ter acesso. |
   | BAIXA | apenas origem desconhecida | Provavelmente legítimo. Confirme na revisão normal. |

4. Para cada usuário listado, o owner da Rede (ou a plataforma, escolhendo a Rede na tela) abre **Usuários → Editar unidades**:
   - acesso devido: mantenha marcado e salve (vira `confirmado_manual`);
   - acesso indevido: desmarque e salve (vínculo inativado, sessões revogadas);
   - usuário de outra Rede vinculado por engano: desmarque todas as unidades desta Rede. Isso é aceito porque ele mantém unidade na Rede dele, e o vínculo com a Rede também é inativado.
5. Rode o diagnóstico de novo e confirme que não restou nada com prioridade ALTA.
6. Usuários ativos que ficarem sem nenhuma unidade não conseguem entrar (`USUARIO_SEM_UNIDADE_AUTORIZADA`). O diagnóstico lista esses usuários ao final. Atribua unidade pela tela ou inative o usuário.

## 5. O que não fazer

- Não apagar linhas de `usuario_unit`/`usuario_tenant` direto no banco. Isso perde histórico e auditoria.
- Não preencher `origem` em massa por SQL: isso registra uma confirmação que ninguém fez.
- Não reintroduzir `ensureUserDefaultScope` nem chamadas equivalentes no login, na sessão ou no refresh.

## 6. Validação de referência (GS-03)

Numa base criada pelo código anterior, com os vínculos automáticos:

- o boot com o código novo manteve os 17 vínculos idênticos;
- o diagnóstico marcou 4 vínculos com prioridade ALTA: `recepcao.filial` na Matriz e o owner da Rede B na Rede A;
- após a limpeza pela API, restaram 0 vínculos com prioridade ALTA, o owner da Rede B ficou só com a Rede B e `recepcao.filial` ficou só com a Filial.
