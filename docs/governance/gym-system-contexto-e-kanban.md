# Gym System · Contexto e Kanban da reformulação

## Como usar este arquivo

Coloque este arquivo em `docs/governance/gym-system-contexto-e-kanban.md` no repositório `C:\Projetos\gym-system`. Versione as decisões e os aceites junto do projeto. Para revisar com o ChatGPT, compartilhe a versão atual deste arquivo e o resumo do último lote. Os detalhes técnicos e as evidências continuam nos documentos, no histórico e nos testes do repositório.

**Para preparar o próximo prompt no Claude Code**

```text
Leia docs/governance/gym-system-contexto-e-kanban.md. Confira o estado atual do repositório em modo leitura. Identifique o próximo lote com dependências e regras resolvidas. Entregue só o prompt desse lote, com escopo, critérios de aceite e testes. Se houver um bloqueio, diga qual decisão ou evidência falta.
```

**Para executar um lote no Claude Code**

```text
Leia docs/governance/gym-system-contexto-e-kanban.md. Execute somente o L01 conforme o prompt desse lote. Registre o andamento e os resultados no quadro. Entregue o diff e a evidência para minha revisão. Eu faço a integração pelo CMD.
```

Troque `L01` pelo ID autorizado na execução seguinte.

## Contexto estável

- **Objetivo.** Evoluir o Gym System para um SaaS de academias. O primeiro piloto é de uma academia com uma unidade. Matriz e Filial entram no piloto multiunidade. O escopo também inclui assinatura SaaS, integrações, recorrência do aluno, catraca e relatórios.
- **Referência histórica.** O diagnóstico foi feito na `main` do commit `89903bd`. Nesse ponto, o backend usa Node.js e Express, o frontend usa React e Vite, e a base de desenvolvimento é SQLite. Confira branch, commit, estado do trabalho e documentação antes de assumir que uma regra ou pendência continua igual.
- **Rede e unidade.** Rede é o tenant. Matriz e Filial são unidades da mesma rede. Teste isolamento com duas redes fictícias, mesmo no piloto de uma única unidade por academia.
- **GS-02.** O alvo multiunidade tem um cadastro e uma matrícula por aluno na rede. A unidade do contrato recebe a mensalidade e registra o valor em seu caixa e fechamento. O plano define onde a pessoa pode treinar. A visita fica registrada na unidade visitada. A migração preserva o histórico dos cadastros, contratos, pagamentos e entradas.
- **Regressões financeiras.** Preserve os pagamentos parciais, a proteção contra cobrança duplicada em reenvios, o estorno por pagamento e o bloqueio A-06 da edição de conta em mês de origem ou de destino fechado.
- **Dois fluxos de cobrança.** A plataforma cobra a assinatura do SaaS da academia. A academia recebe a mensalidade do aluno. Cada fluxo tem seu próprio ciclo e seus registros financeiros, mesmo quando usa o mesmo provedor.
- **Encaixe das integrações.** O Gym System tem um catálogo interno. Configurar, ativar, trocar e desligar seguem um fluxo comum. Pagamento, catraca e demais categorias têm contratos próprios. Cada fornecedor entra por um adaptador. Use configuração e credenciais no escopo da rede ou da plataforma, conforme quem opera a conexão.
- **Troca de gateway.** Cada cobrança registra o fornecedor e a conexão que a emitiram. Use a conexão ativa para novas cobranças e a de origem para conciliar ou estornar cobranças anteriores. Valide a desativação com pendências em sandbox.
- **Relatórios.** No L22, comece pelo fechamento de caixa. Imprimir ou salvar como PDF usa o layout A4 da tela de impressão. CSV ou Excel serve à análise. O relatório mantém o escopo, os filtros e os totais exibidos, inclusive em várias páginas.

### Decisões a confirmar antes dos lotes afetados

| Lote | Ponto para decisão do dono do produto |
| --- | --- |
| L02 | DN-3 aprovada em 10/11/2026. Veja [requisitos e estados da entrega](requisitos-base.md#dn-3--permissões-operacionais-do-l02). |
| L03 | Retorno por unidade, quitação em atraso e antecipação de um ciclo aprovados. Veja [GS-07](requisitos-base.md#gs-07--planos-e-mensalidades-mensal-manual). |
| L04 | Cancelamento, correções após fechamento, vendas e aprovação de estornos. |
| L07–L09 | Tratamento de cadastros duplicados, seleção das unidades do plano, momento em que mudanças afetam um ciclo pago, dependentes e transferência de unidade do contrato. |
| L11–L12 | Oferta SaaS, ativação, atraso, suspensão e primeiro gateway. |
| L16, L18–L21 | Segundo fornecedor, política de recorrência do aluno, modelo de catraca e conduta durante indisponibilidade. |

Registre cada decisão com data, cenário, regra aprovada e lotes afetados. Quando uma escolha já constar dos requisitos aprovados, referencie o registro existente.

## Fluxo de trabalho

**Fila** aguarda dependências ou refinamento. **Pronto** tem escopo, decisões e aceite definidos. **Em execução** começa após sua autorização. **Em revisão** já tem diff e evidências. **Concluído** exige sua aprovação e o registro do commit ou da integração acordada. **Bloqueado** registra o motivo e a condição para retomar. Trabalhe em um lote por vez entre execução e revisão.

**RACI no projeto solo.** Você executa e aprova como responsável A/R. Claude Code apoia o levantamento, a implementação autorizada e os testes. ChatGPT pode preparar prompts, organizar o quadro e revisar evidências. Você decide as regras, homologa a entrega e faz commit e push pelo CMD.

**Antes.** Leia este arquivo e as fontes do lote. Registre `git status -sb`, a branch e o commit. Confira o estado real do código e os testes. Combine a branch do lote, use base descartável ou sandbox e trate decisões abertas antes de implementar a parte afetada.

**Durante.** No modo execução, mova apenas o lote autorizado para Em execução. Preserve alterações locais do usuário e dados operacionais. Para correções, reproduza primeiro quando possível e rode o mesmo cenário depois. Para regras novas, valide o caminho permitido, o bloqueado e as regressões pertinentes. Mantenha credenciais fora dos prompts, diffs e evidências.

**Depois.** Entregue arquivos alterados, resumo do diff, comandos e resultados dos testes, pendências e evidências do aceite. Registre a branch e atualize para Em revisão. Se uma dependência impedir a entrega, marque Bloqueado e descreva a condição para retomar. O dono confirma o aceite, integra e registra a conclusão.

## Kanban inicial

O dono aprovou o L01, integrado em `ba5e23c`. O L02 foi concluído e integrado à `main` em `fb5656b`. O L03 e o sublote de integridade do L04 também estão integrados. O L04 segue aberto para o fluxo de estornos e as telas de fechamento. As dependências abaixo organizam o trabalho. Ajuste a ordem quando houver evidência ou decisão que justifique a mudança.

| ID | Lote | Depende de | Estado | Aceite resumido |
| --- | --- | --- | --- | --- |
| L01 | Isolamento e acesso ao Financeiro | Base do diagnóstico | Concluído (`ba5e23c`) | Duas redes isoladas na API. Papel e categoria de conta validados no servidor. |
| L02 | Permissões operacionais por função | L01, DN-3 | Concluído (`fb5656b`) | A matriz aprovada de ações por perfil bate com a API e com as telas. |
| L03 | Contrato, renovação manual e entrada | L02, decisões da GS-07 | Integrado (`6cd16bd`) | Aluno contrata, paga, renova e tem acesso decidido conforme a cobertura. |
| L04 | Contas, venda, estoque e fechamento | L02–L03, regras financeiras | Aberto. Integridade integrada (`e6220b1`) | A-13, A-10 e permissões de venda e estoque integrados. Solicitação, aprovação e execução de estornos e telas de fechamento pendentes. |
| L05 | Homologação do piloto de uma unidade | L01–L04 | Fila | Fluxo de cadastro ao fechamento demonstrado com dados fictícios e perfis da operação. |
| L06 | Modelo da matrícula única e unidade do contrato | L05, GS-02 | Fila | Identidade única dentro de cada rede e vínculo explícito do contrato à unidade. |
| L07 | Migração dos cadastros existentes | L06 | Fila | Conflitos revisáveis e totais, vínculos e histórico reconciliados em ensaio. |
| L08 | Unidades do plano e direitos por ciclo | L06, regra de vigência | Fila | Cobertura do titular e dependentes segue as unidades e o ciclo aprovados. |
| L09 | Visita à filial e aceite multiunidade | L07–L08 | Fila | Uma mensalidade no caixa da unidade do contrato e visita na unidade autorizada. |
| L10 | Base dos conectores | L05, contratos das categorias | Fila | Adaptadores registrados por tipo, com configuração e credenciais no escopo correto. |
| L11 | Ativação e ciclo da assinatura SaaS | L09, oferta e política de ativação | Fila | Ativação, atraso e encerramento seguem os estados comerciais aprovados. |
| L12 | Primeiro gateway e webhooks da assinatura SaaS | L10–L11 | Fila | Aviso autenticado e repetido gera uma baixa no fluxo e na rede corretos, em sandbox. |
| L13 | Ensaio da migração do banco | L09, modelo alvo | Fila | IDs, totais e isolamento reconciliados em PostgreSQL, com procedimento de reversão. |
| L14 | Exportação de dados, backup e restauração | L13 | Fila | Exportação autorizada e restauração ensaiada em ambiente isolado. |
| L15 | Preparação da publicação e monitoramento | L12–L14 | Fila | Ambiente de homologação, publicação e reversão documentadas, com sinais de operação monitoráveis. |
| L16 | Segundo conector de referência | L10, L12, fornecedor escolhido | Fila | Outra categoria, como mensagens ou ERP, usa o fluxo comum de conectores. |
| L17 | Gestão de conectores por academia | L12, L16 | Fila | Duas redes ativam, trocam e desligam conexões. Cobranças novas e anteriores seguem a conexão adequada. |
| L18 | Cobrança recorrente do aluno | L03, L12, L17 | Fila | Pagamento confirmado atualiza uma vez a mensalidade e a cobertura do aluno no escopo do contrato. |
| L19 | Conciliação, falhas e cancelamento da recorrência | L18 | Fila | Falha, reenvio, estorno e cancelamento têm efeitos financeiros e de cobertura verificáveis. |
| L20 | Integração da catraca piloto | L09, L17, equipamento definido | Fila | Dispositivo cadastrado na unidade aplica a decisão de acesso e registra entradas. |
| L21 | Indisponibilidade e conciliação das entradas | L20 | Fila | A política de indisponibilidade funciona e reenvios geram um único evento. |
| L22 | Relatórios, impressão e aceite final | L15, L17, L19, L21 | Fila | Tela, papel, PDF e planilha apresentam escopo e totais consistentes. Fluxos acordados homologados. |

## L01 · Prompt pronto para execução

> No Gym System, use duas academias fictícias, cada uma com uma unidade, em base descartável. Confira a branch e o commit. O diagnóstico de referência é o `89903bd`. Reproduza a leitura ou alteração indevida de dados financeiros por uma conta da recepção e o vínculo de uma conta a uma categoria de outra rede.
>
> Aplique no backend a regra de acesso ao módulo financeiro já adotada pela interface para `platform_admin`, `owner`, `admin` e `financeiro`. Verifique dashboard e indicadores, contas, plano de contas, ativos, orçamento, análise do fechamento e aliases. Preserve a autorização específica de estorno, fechamento e reabertura. Valide `plano_contas_id` no escopo da rede e na transação da gravação. Na leitura, mostre o nome da categoria somente quando pertencer à rede do lançamento, inclusive em registros legados. Nos lançamentos automáticos e estornos, quando faltar categoria válida da própria rede, preserve valor e origem e registre o lançamento sem categoria.
>
> Em ambos os sentidos, valide listagens restritas à rede. A seleção de unidade de outra rede recebe 403 e o acesso direto a um registro externo no próprio escopo recebe 404. Verifique 401 sem sessão e 403 para perfis sem acesso ao módulo. A recepção pode atender alunos e registrar entradas no seu escopo. Categorias da própria rede funcionam. A recepção recebe 403 no estorno. O perfil `financeiro` pode estornar no próprio escopo e recebe 403 ao reabrir. Um perfil autorizado consegue reabrir um período da própria unidade. As recusas por perfil, categoria externa ou escopo preservam dados, saldos e o fechamento.
>
> Rode o mesmo teste antes e depois e os smokes de identidade, S1-P0, pagamentos P1 e A-06. Atualize a cobertura de autorização das rotas afetadas. Entregue diff, comandos e evidências para revisão. Registre GS-02 e decisões de mudança de papéis da DN-3 como lotes separados.

## L02 a L04 · Rascunhos para revisar quando chegarem à vez

### L02 · Permissões operacionais por função

> Aplique a [DN-3 aprovada](requisitos-base.md#dn-3--permissões-operacionais-do-l02) nas rotas e telas existentes. Teste ações permitidas e recusadas em duas Redes fictícias e preserve o escopo da unidade. Registre o estado de cada fluxo e os sublotes necessários.

### L03 · Contrato, renovação manual e entrada

> Confirme o aceite do L02 e consulte as decisões da GS-07. Mapeie, em uma única unidade, contratação, geração de mensalidade manual, pagamento, início e fim da cobertura, renovação e decisão de entrada. Corrija as lacunas confirmadas para o piloto segundo as regras aprovadas. Teste cobrança em aberto, pagamento parcial, quitação, ciclo vencido, renovação e efeito de estorno no acesso conforme a política registrada. Valide pelo fluxo normal da aplicação. Registre qualquer regra sem decisão como bloqueio do trecho afetado.

### L04 · Contas, vendas, estoque e fechamento

A primeira entrega valida a data de lançamento e preserva a data atual se omitida no PUT. Venda e gestão de produtos seguem a matriz de papéis. O registro de venda aceita `Idempotency-Key` por rede e unidade. A mesma chave com os mesmos dados devolve a venda original, e dados diferentes com a mesma chave recebem `409 IDEMPOTENCIA_CONFLITO`. O lançamento usa categoria de receita da própria rede ou fica sem categoria.

**Decisão pendente:** confirmar quando o preço manual pode substituir o preço de catálogo e quem pode fazê-lo. A primeira entrega preserva o comportamento atual do preço. Aprovação de estornos e interface de fechamento seguem nas próximas entregas.

> Confirme o aceite do L03. Reproduza e trate as validações A-13 confirmadas, incluindo a edição de conta com `data_lancamento` ausente ou inválida. Use o contrato de erros da API. Verifique a venda com baixa de estoque e lançamento de receita, as reversões previstas e a proteção de período fechado. Corrija os defeitos reproduzidos dentro das regras financeiras aprovadas. Teste que tentativas recusadas preservam estoque, lançamentos e fechamento. Rode os smokes de pagamentos e A-06 e registre o que precisa de decisão em lote próprio.

## Modelo para preparar um novo prompt

```text
Lote e objetivo
Base atual, dependências e decisão de produto aplicável
Mudança autorizada e limites do lote
Fluxo normal de uso e critérios de aceite
Testes e regressões, com comandos para repetir
Evidências esperadas, branch e devolução para revisão do dono
```

## Registro de execução e aceite

Para cada entrega, registre ID do lote, data, branch, commit-base, arquivos alterados, testes executados, resultados, pendências e decisão do dono. Após integrar, registre o commit resultante e atualize o estado no quadro. Na primeira rodada, use o L01 como entrada e preencha o registro com os resultados reais da execução.

### L01 · Isolamento e acesso ao Financeiro

- **Estado:** Concluído, com aprovação do dono em 10/11/2026.
- **Branch e base:** `s1-financeiro-isolamento`, criada a partir da `main` no commit `89903bd`. Alterações sem commit.
- **Arquivos alterados:** `backend/constants/userRoles.js`, `backend/server.js`, `backend/routes/contasFinanceiras.js`, `backend/routes/ativos.js`, `backend/routes/orcamento.js`, `backend/routes/reversoes.js`, `backend/services/FinanceiroService.js`, `backend/services/ReversaoControladaService.js`, `docs/governance/rbac-route-coverage.md`, `tests/scripts/README.md`, `tests/scripts/smoke-financeiro-isolamento.js` (novo) e este arquivo.
- **Regra aplicada:** permissão `financeiro:acessar` (`platform_admin`, `owner`, `admin`, `financeiro`) em dashboard e indicadores, contas, plano de contas, ativos, orçamento e fechamento, com os aliases. Estorno, fechar, reabrir e sincronizar mantêm a permissão própria. `plano_contas_id` validado na Rede, na transação da gravação (`422 PLANO_CONTAS_INVALIDO`). Nome da categoria só aparece quando ela é da Rede do lançamento. Lançamentos automáticos e contrapartidas de estorno sem categoria válida da Rede ficam sem categoria, com valor e origem preservados. Ativos e orçamento de outra Rede pelo ID respondem `404`.
- **Teste do lote** (`smoke-financeiro-isolamento.js`, duas academias fictícias com uma unidade cada, base descartável, 10/11/2026):

| Requisito | Antes (`89903bd`) | Depois |
| --- | --- | --- |
| R1 Isolamento entre Redes | 48/56 | 56/56 |
| R2 Acesso ao Financeiro (401, 403, recepção operando) | 5/20 | 20/20 |
| R3 Categoria de outra Rede | 3/12 | 12/12 |
| R4 Estorno, fechamento e reabertura | 10/10 | 10/10 |

- **Regressão (depois):** `smoke-identidade` 71/71, `smoke-s1-p0` 33/33, 31/31 e 12/12, `smoke-p1-pagamentos` 42/42, `smoke-a06-conta-fechamento` 18/18, checagem HTTP da GS-01 sem falhas, nenhum erro 500.
- **Comandos:** em `tests/scripts/README.md`, seção `smoke-financeiro-isolamento.js`.
- **Pendências fora do lote:** mudanças de papéis da DN-3 (L02), GS-02 (L06 a L09), categorias de receita lançadas em contas de despesa na Rede do seed (A-10, a tratar no L04) e a `matriz-permissoes.md`, que ainda não descreve o papel `financeiro` (L02).
- **Decisão do dono:** L01 aprovado.
- **Commit resultante:** `ba5e23c`, presente em `main` e na referência local de `origin/main`.

### L02 · Permissões operacionais por função

- **Estado:** Concluído e integrado à `main` em `fb5656b`. Base do lote `ba5e23c`.
- **Regra de produto:** [DN-3 aprovada, cobertura e dependências](requisitos-base.md#dn-3--permissões-operacionais-do-l02). [Matriz por ação](matriz-permissoes.md#8-dn-3-aprovada--ações-e-escopo) e [cobertura de rotas](rbac-route-coverage.md#l02--cobertura-da-dn-3).
- **Sublotes:** aprovação de estorno e novas telas de caixa no L04. Solicitações de desconto e campanhas após os fluxos de cobrança do L03, antes de liberar campanhas. Catálogo local em L08 e entrada multiunidade em L08–L09. Concessões explícitas de alcance de Rede e controles master antes da publicação no L15. Cada dependência tem critérios de aceite na DN-3.
- **Evidência final em base descartável com Node 22.19.0:** L02 HTTP e SQLite 111/111, L02 ciclos com relógio controlado 24/24, identidade 71/71, S1-P0 37/37 + 30/30 + 12/12, P1 41/41, isolamento de transação 11/11, A-06 18/18, isolamento financeiro 102/102, F0 20/20 e cobertura 6/6. Build de produção do frontend aprovado. A verificação em Edge das telas e do bloqueio por URL direta pertence à rodada anterior.
- **Correções integradas:** a reemissão no mesmo dia da primeira cobrança sem pagamento preserva o proporcional e o vencimento após cancelamento ou exclusão lógica. No caso de exclusão lógica, o smoke confirma R$ 3,57 com vencimento em 27/02/2025, um único lançamento a receber ativo e o registro excluído preservado no histórico. O limite do plano é avaliado por titular e seus dependentes quando o dono o reduz. O teste cobre edição do nome entre unidades e exclusão recusada para plano em uso na Filial.
- **Limite da evidência:** três emissões simultâneas para o mesmo aluno e ciclo chegaram a um único processo da API, no mesmo SQLite. A prova inclui uma cobrança, um lançamento a receber e nenhum pagamento criado pela emissão. O teste de datas chama o serviço real em sequência com relógio de negócio controlado. Concorrência entre instâncias está fora da rodada. [Comandos, adaptação dos smokes e casos pendentes](../../tests/scripts/README.md#smoke-l02js-dn-3--permissões-operacionais).
- **Liberação:** estornos permanecem bloqueados até a entrega do fluxo de solicitação, aprovação e execução. O aceite desse fluxo precisa demonstrar execução positiva e contrapartida financeira. A homologação do piloto continua no L05, após os aceites operacionais de L03 e L04.

### L03 · Contratação, renovação manual e entrada

- **Estado:** Revisado em 12/11/2026 e integrado à `main` em `6cd16bd`. Branch de trabalho `codex/l03-contratacao-renovacao-entrada`, base `fb5656b`.
- **Regra aplicada:** política de retorno por unidade configurada pelo dono, com proporcional como padrão. Emissão padrão, prévia e contratação/renovação do mensal manual compartilham o cálculo de ciclo. Cobrança existente mantém valor e datas. Recebimentos pela tela podem ser parciais e usam o dia operacional. Renovação antecipada limita-se ao próximo ciclo.
- **Evidências em base descartável, Node 22.19.0:** ciclos 39/39, HTTP L02/L03 118/118, cobertura 6/6, pagamentos P1 41/41, acesso F0 20/20, identidade 71/71, S1-P0 37/37 + 30/30 + 12/12, isolamento de transação 11/11, A-06 18/18, isolamento financeiro 102/102 e build de produção aprovado. No Edge, confira configuração e retorno nas duas políticas, reutilização após troca de política, emissão, pagamento parcial com resposta perdida, recusa acima do saldo, quitação, entrada e renovação antecipada.
- **Dependência:** aprovação de estornos permanece no L04. A execução direta continua bloqueada.

### L04 · Integridade de contas, vendas e estoque

- **Estado:** Sublote integrado à `main` pelo PR #2 em `e6220b1`, com a implementação em `faf8fe3` e base `2ce352b` (Node 24.22.3).
- **Entrega:** A-13 valida as datas de lançamento e preserva a data omitida no `PUT`, com trava na origem e no destino. A matriz rege as escritas de venda e estoque. A venda grava estoque e receita em uma transação e aceita reenvio por chave de idempotência. O A-10 restringe a categoria da receita de venda a uma categoria compatível da própria rede.
- **Evidências em base descartável, Node 24.22.3:** 13 smokes aprovados, incluindo 66/66 verificações de integridade do L04, e build de produção aprovado. No Chrome, a recepção reenviou a mesma chave após perda simulada da resposta e recebeu o ID original. O SQLite confirmou uma venda, uma baixa e uma receita de R$ 50.
- **Pendências do L04:** solicitação, aprovação e execução de estornos e telas de fechamento. O preço manual versus o preço de catálogo permanece como decisão aberta.

## Fontes para a revisão técnica

- `docs/governance/requisitos-base.md` para requisitos, decisões e lotes anteriores.
- `docs/governance/matriz-permissoes.md` e `docs/governance/rbac-route-coverage.md` para papéis e cobertura de rotas.
- `docs/governance/error-contracts.md` e `tests/scripts/README.md` para erros e testes reproduzíveis.
- Código, histórico Git e evidências recentes para confirmar o estado implementado.
