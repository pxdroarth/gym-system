# Matriz de Permissões — Sistema Academia SA

## 1. Objetivo

Esta matriz define visibilidade, operação e escopo por perfil no Sistema Academia SA. Ela serve como referência para backlog, testes, UML, frontend, backend e validação de segurança.

O documento não substitui a implementação de permissões no backend. A matriz orienta o comportamento esperado do produto e deve ser usada para revisar rotas, componentes de UI, casos de uso e testes por perfil.

## 2. Princípios de permissão

- O backend é a autoridade final de permissão.
- O frontend apenas oculta, mostra ou organiza a UI conforme o perfil.
- Deve prevalecer o menor privilégio possível.
- Financeiro é módulo restrito.
- Histórico de Atividades é módulo visual somente leitura.
- Auditoria é mecanismo técnico de registro e rastreabilidade.
- Consolidado da Rede é somente leitura.
- Onboarding da Rede é interno e restrito à plataforma.
- Permissões devem respeitar escopo de Rede/Unidade.
- Nenhum perfil operacional deve acessar administração global da plataforma.
- Rotas sensíveis devem bloquear acesso diretamente no backend, mesmo que a Sidebar esconda a opção.

## 3. Escopos

**Plataforma/global**

Escopo de administração interna da plataforma. Pode abranger múltiplas Redes. Deve ser reservado a `platform_admin`.

**Rede**

Escopo da organização de academia, incluindo Matriz, Filiais e Unidades relacionadas. Internamente pode corresponder ao termo técnico `tenant`.

**Unidade**

Escopo operacional diário. Internamente pode corresponder ao termo técnico `unit`.

**Matriz**

Unidade principal de uma Rede. É termo de produto e deve seguir as mesmas regras de escopo de Unidade, com possíveis responsabilidades administrativas maiores conforme regra futura.

**Filial**

Unidade subordinada ou associada a uma Rede. É termo de produto e deve respeitar isolamento de Unidade.

**Somente leitura**

Permite visualizar dados, sem criar, editar, excluir, reverter ou executar ações operacionais.

**Operação**

Permite executar rotinas do dia a dia, como cadastro, consulta, atualização operacional e registro de eventos.

**Administração**

Permite ações sensíveis, como configurar usuários, papéis, status, financeiro, fechamento, reversões e escopos.

## 4. Perfis e responsabilidades

### platform_admin

Responsável pela administração interna da plataforma. Pode gerenciar onboarding de Rede, configuração inicial, visão global e suporte administrativo.

Pode acessar Histórico de Atividades global quando necessário. No ambiente atual/demo, pode acessar módulos sensíveis para validação e suporte. Em produção futura, deve ser avaliada a separação entre suporte técnico global e visibilidade financeira global das Redes.

### owner

Dono da Rede/academia. Tem acesso amplo dentro da própria Rede, incluindo Unidades permitidas, financeiro, Consolidado da Rede e Histórico de Atividades escopado.

Não acessa administração global da plataforma. Não cria novas Redes SaaS. Não deve alterar configurações internas da plataforma.

### admin

Administrador operacional da academia. Tem acesso amplo à operação da própria Rede e Unidades permitidas. Pode gerenciar alunos, planos, mensalidades, pagamentos, produtos, vendas e financeiro se autorizado pela regra final.

Não acessa onboarding global da plataforma. Não administra múltiplas Redes fora do seu escopo.

### financeiro

Confere o fechamento da unidade, acessa o módulo Financeiro e concede desconto excepcional no próprio escopo, com motivo. A execução de estorno pelo financeiro depende da aprovação registrada no fluxo da DN-3.

### gerente

Perfil de gestão operacional intermediária. Pode acompanhar operação, alunos, mensalidades, produtos e vendas.

Financeiro completo deve ser restrito ou parcial conforme decisão de negócio. Não acessa onboarding global e não altera configurações críticas de plataforma.

### recepção

Perfil de atendimento diário. Pode consultar/cadastrar alunos e apoiar rotinas operacionais.

Não deve acessar financeiro completo. Não deve acessar Histórico de Atividades completo. Pode emitir cobrança padrão calculada pelo servidor e receber pagamentos auditados. Alterações posteriores de plano, vencimento, status e vínculos exigem permissão específica.

### operador_acesso

Perfil focado em acesso/catraca. Pode verificar status e registrar/liberar acesso conforme regra.

Não deve acessar financeiro. Não deve registrar pagamento por padrão. Não deve acessar Histórico de Atividades, onboarding, Consolidado da Rede ou administração.

## 5. Matriz por módulo

| Módulo | platform_admin | owner | admin | gerente | recepção | operador_acesso | Observações |
|---|---|---|---|---|---|---|---|
| Dashboard operacional | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Leitura/Operação limitada | Leitura limitada | Dashboard comum não deve expor financeiro restrito. |
| Consolidado da Rede | Relatório das unidades autorizadas | Leitura / Rede integral | Leitura / unidades autorizadas | Não permitido | Não permitido | Não permitido | Integral exige permissão de Rede. |
| Onboarding da Rede | Total | Não permitido | Não permitido | Não permitido | Não permitido | Não permitido | Onboarding é interno da plataforma. |
| Usuários internos | Total | Escopo Rede | Escopo das suas Unidades | Não permitido | Não permitido | Não permitido | Alterar papel/status/unidades é ação crítica. Regras na seção 7.1 (GS-03). |
| Alunos | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Leitura limitada | Recepção pode cadastrar/consultar conforme fluxo operacional. |
| Perfil do aluno | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Leitura limitada | Operador deve ver apenas o necessário para acesso. |
| Planos | Leitura | Gestão do catálogo compartilhado | Leitura | Leitura | Leitura | Não permitido | Catálogo exclusivo por unidade depende de L08. |
| Associações/vínculos | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Não permitido | Impacta acesso e mensalidade. |
| Mensalidades | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Leitura limitada | Cancelamento é ação crítica. |
| Pagamentos | Escopo vinculado | Unidade autorizada | Unidade autorizada | Receber na unidade | Receber na unidade | Não permitido | Estorno segue a DN-3. |
| Produtos | Leitura no escopo | Gestão na unidade | Gestão na unidade | Gestão na unidade | Leitura no escopo | Leitura no escopo pela API | Escritas com `produtos:gerenciar`. |
| Vendas | Leitura no escopo | Registrar na unidade | Registrar na unidade | Registrar na unidade | Registrar na unidade | Leitura no escopo pela API | Registro com `vendas:registrar`. Reversão direta bloqueada. |
| Financeiro | Acesso no escopo vinculado | Acesso no escopo | Acesso no escopo | Não permitido | Não permitido | Não permitido | `financeiro:acessar` inclui o perfil `financeiro`. |
| Plano de contas | Leitura | Gestão de Rede | Leitura | Não permitido | Não permitido | Não permitido | Financeiro também consulta. A escrita exige `plano_contas:gerenciar_rede`, hoje exclusiva do dono. |
| Contas financeiras | Acesso no escopo vinculado | Unidade autorizada | Unidade autorizada | Não permitido | Não permitido | Não permitido | A API também permite ao financeiro criar e marcar como paga na unidade autorizada. Decisões em aberto na seção 6.1. |
| Fechamento mensal | Análise no escopo vinculado | Analisar, fechar e reabrir | Analisar e fechar | Não permitido | Não permitido | Não permitido | Financeiro analisa. Reabertura exige motivo e auditoria. |
| Acessos | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Operação limitada | Operação deve respeitar regra de mensalidade/status. |
| Liberação manual de acesso | Total | Escopo Rede | Escopo Rede/Unidade | Pendente | Pendente | Operação limitada | Deve gerar Auditoria. |
| Histórico de Atividades | Total | Leitura / Escopo Rede | Leitura / Escopo Rede/Unidade | Não permitido | Não permitido | Não permitido | Módulo visual somente leitura. |
| Auditoria técnica | Total | Leitura indireta via Histórico | Leitura indireta via Histórico | Não permitido | Não permitido | Não permitido | Mecanismo técnico, não área operacional editável. |
| Configurações da Rede | Total | Escopo Rede | Pendente | Não permitido | Não permitido | Não permitido | Configurações críticas devem ser restritas. |
| Configurações da Unidade | Total | Escopo Rede | Escopo Unidade / Pendente | Pendente | Não permitido | Não permitido | Escopo e impacto operacional precisam ser validados. |

## 6. Matriz por ação crítica

| Ação crítica | Perfis permitidos | Escopo | Exige auditoria? | Observação |
|---|---|---|---|---|
| criar Rede | platform_admin | Plataforma/global | Sim | Onboarding interno da plataforma. |
| editar Rede | platform_admin | Plataforma/global | Sim | Owner pode ter edição limitada no futuro; pendente. |
| criar Unidade/Matriz/Filial | platform_admin, owner | Plataforma/Rede | Sim | Admin pode ser pendente conforme regra final. |
| criar usuário interno | platform_admin, owner, admin | Global/Rede/Unidade | Sim | Deve respeitar escopo e papel do ator. |
| alterar papel de usuário | platform_admin, owner, admin | Global/Rede/Unidade | Sim | Revoga sessões do usuário afetado. |
| alterar status de usuário | platform_admin, owner, admin | Global/Rede/Unidade | Sim | Inativar/bloquear revoga sessões. |
| alterar unidades autorizadas de usuário | platform_admin, owner, admin | Global/Rede/Unidade | Sim | Adicionar/remover unidade revoga sessões do usuário afetado (GS-03). |
| cadastrar aluno | owner, admin, gerente, recepção | Rede/Unidade | Sim | Recepção deve operar em escopo limitado. |
| editar aluno | owner, admin, gerente, recepção | Rede/Unidade | Sim | Campos sensíveis podem exigir restrição futura. |
| alterar catálogo de planos compartilhado | owner | Rede | Sim | Gestão por unidade depende de catálogo local. |
| emitir mensalidade padrão | owner, admin, gestor, recepção | Unidade autorizada | Sim | Valor, vencimento e cobertura calculados pelo servidor. |
| pagar mensalidade | owner, admin, gestor, recepção | Unidade autorizada | Sim | Recebimento pelo fluxo de pagamentos. |
| cancelar mensalidade | owner, admin | Rede/Unidade | Sim | Ação sensível; deve respeitar fechamento mensal. |
| reverter pagamento | gestor solicita, owner/admin aprova, financeiro executa | Unidade autorizada | Sim | Execução direta bloqueada até o fluxo aprovado. |
| registrar venda | owner, admin, gestor, recepção | Rede/Unidade | Sim | `vendas:registrar` em `POST /vendas-produtos` e `POST /vendasProdutos`. |
| reverter venda | Fluxo da DN-3 pendente | Rede/Unidade | Sim | Execução direta bloqueada. |
| criar, editar e excluir produto e ajustar estoque | owner, admin, gestor | Rede/Unidade | Regra de governança | `produtos:gerenciar`. As rotas atuais de gestão de produto não gravam evento próprio de auditoria. A baixa pela venda é auditada no registro da venda. |
| acessar financeiro | platform_admin, owner, admin, financeiro | Escopo vinculado | Conforme ação | `financeiro:acessar`. Política de suporte master pendente. |
| criar conta financeira | owner, admin na matriz | Rede/Unidade | Sim | A API também permite ao financeiro. Decisão pendente na seção 6.1. |
| marcar conta financeira como paga | owner, admin na matriz | Rede/Unidade | Sim | A API também permite ao financeiro. Decisão pendente na seção 6.1. |
| analisar fechamento mensal | platform_admin, owner, admin, financeiro | Rede/Unidade | Leitura | `financeiro:acessar`. |
| fechar período mensal | owner, admin | Rede/Unidade | Sim | `financeiro:acessar` e `fechamento:fechar`. |
| reabrir fechamento mensal | owner | Rede/Unidade | Sim | `financeiro:acessar`, `fechamento:reabrir` e motivo obrigatório. |
| gerir plano de contas | owner | Rede | Regra de governança | `financeiro:acessar` e `plano_contas:gerenciar_rede` nos dois aliases. As rotas atuais não gravam evento próprio de auditoria. |
| liberar acesso manualmente | platform_admin, owner, admin, operador_acesso | Rede/Unidade | Sim | Gerente/recepção pendentes conforme operação. |
| ver Histórico de Atividades | platform_admin, owner, admin | Global/Rede/Unidade | Não altera dados | Somente leitura; bloqueado para perfis operacionais. |
| ver Consolidado da Rede | owner integral; admin e platform_admin em unidades autorizadas | Rede/Unidade | Somente leitura | Integral exige alcance explícito de Rede. |

### 6.1. Contas financeiras · divergência entre matriz e API

A matriz lista dono e admin para criar uma conta e marcá-la como paga. As duas rotas usam `financeiro:acessar` e validam Rede e Unidade. A validação em SQLite descartável com Node 24.22.3 confirmou 15 cenários para dono, admin e financeiro.

- Na Matriz autorizada, os três receberam `201` ao criar conta pendente e `200` ao marcar outra conta como paga. A auditoria identificou ator e unidade.
- Ao selecionar uma unidade sem vínculo, as duas ações devolveram `403 UNIT_FORBIDDEN`. Ao tentar marcar uma conta externa como paga com a Matriz selecionada, os três receberam `404 CONTA_NAO_ENCONTRADA`. As recusas preservaram as contas e a auditoria de conclusão.
- Decisão aberta 1. O financeiro deve poder criar contas financeiras?
- Decisão aberta 2. O financeiro deve poder marcar contas financeiras como pagas?

Veja o [registro do L04](gym-system-contexto-e-kanban.md#l04--integridade-de-contas-vendas-e-estoque).

## 7. Regras de segurança por perfil

- `operador_acesso` não deve acessar financeiro.
- `recepção` não deve acessar financeiro completo.
- `owner` e `admin` não acessam onboarding global da plataforma.
- Histórico de Atividades é bloqueado para perfis operacionais.
- Alteração de papel/status revoga sessões do usuário afetado.
- Ações financeiras e administrativas críticas devem gerar Auditoria.
- Rota direta deve ser bloqueada pelo backend, não apenas pela Sidebar.
- Perfis operacionais não devem acessar plataforma/global.
- Permissões devem ser validadas por escopo de Rede/Unidade.
- Dados financeiros globais vistos por `platform_admin` em produção exigem decisão formal.

### 7.1 Gestão de usuários internos (GS-03)

Validado no servidor (`backend/services/UserService.js`); a tela Usuários apenas reflete o retorno da API.

| Regra | Comportamento | Código de erro |
|---|---|---|
| Escopo da Rede | `owner`/`admin` gerenciam apenas a Rede da unidade atual (`X-Unit-Id`). `tenant_id` em query/body só é aceito para `platform_admin`. | `TENANT_FORA_DO_ESCOPO` (403) |
| Usuário de outra Rede | Não aparece na listagem e não pode ser alterado. | `USUARIO_NAO_ENCONTRADO` (404) |
| Unidades gerenciáveis | `platform_admin`: todas as unidades ativas da Rede escolhida. `owner`: todas as unidades ativas da Rede. `admin`: só as unidades em que ele mesmo está autorizado. | `UNIDADE_FORA_DO_ESCOPO` (403) |
| Alvo fora do escopo do admin | Admin só altera quem tem todas as unidades da Rede dentro das unidades dele; lista apenas quem compartilha ao menos uma unidade. | `USUARIO_FORA_DAS_UNIDADES_GERENCIAVEIS` (403) |
| Hierarquia | `platform_admin` > `owner` > `admin` > demais. Ninguém atribui papel acima do próprio nem altera quem está acima. Admin pode gerenciar outro admin. | `HIERARQUIA_INSUFICIENTE` (403) |
| Plataforma | Só `platform_admin` atribui o papel `platform_admin` ou altera conta de plataforma. Contas de plataforma não aparecem para a academia. | `PLATFORM_ADMIN_RESTRITO` (403) |
| Autogestão | Ninguém altera o próprio papel, status ou unidades por esta tela (Minha conta é o lote GS-04). | `USUARIO_AUTOGESTAO_BLOQUEADA` (403) |
| Usuário em mais de uma Rede | Papel e status são globais ao usuário; fora da plataforma não podem ser alterados. Unidades da própria Rede podem. | `USUARIO_MULTI_REDE_RESTRITO` (403) |
| Unidade obrigatória | Criação exige ao menos uma unidade. Remover todas as unidades de uma Rede só é aceito se o usuário mantiver unidade em outra Rede. | `USUARIO_UNIDADE_OBRIGATORIA` (400) |
| Sem vínculo automático | Bootstrap, login, sessão e refresh não criam vínculo. Sem unidade válida (unidade e Rede ativas, vínculo ativo com a Rede), login e refresh falham. | `USUARIO_SEM_UNIDADE_AUTORIZADA` (403) |
| Auditoria | `criar_usuario_interno`, `alterar_papel_usuario`, `alterar_status_usuario`, `alterar_unidades_usuario` (com unidades antes/depois) e revogação de sessões. | — |

Decisões assumidas na GS-03, a validar com o produto: admin pode criar/editar outro admin; owner gerencia todas as unidades da Rede mesmo sem vínculo próprio; contas de plataforma ficam ocultas para a academia.

Vínculos antigos de origem não confirmada: ver `vinculos-escopo-legado.md`.

## 8. DN-3 aprovada · ações e escopo

Esta tabela detalha as decisões aprovadas da DN-3 e o estado da implementação. Gerente corresponde a `gestor` e caixa corresponde a `recepcao`. Para ações de unidade, o ator seleciona uma unidade à qual está vinculado.

| Ação | Regra aprovada e cobertura atual |
| --- | --- |
| Cadastro inicial e edição básica | Recepção, gestor, admin e dono. Status, vencimento e plano pós-cadastro exigem permissão de campos sensíveis. Gestão de associações usa a permissão específica existente. |
| Emitir padrão e receber | Recepção, gestor, admin e dono na unidade. Lançamento excepcional, edição de valores e cancelamento têm guardas próprias; recebimento usa a API de pagamentos. |
| Conceder desconto excepcional | Gestor, financeiro, admin e dono. Motivo obrigatório e registro da ação. Caixa poderá solicitar quando o fluxo próprio estiver disponível. |
| Estornar | Gestor solicita, dono ou admin da unidade aprova e financeiro executa. Execução direta bloqueada até o fluxo de aprovação. |
| Analisar, fechar e reabrir | Financeiro, admin e dono analisam. A API também permite análise ao `platform_admin` no escopo vinculado. Admin e dono fecham. Dono reabre com motivo. Telas novas e política master dependem de sublotes. |
| Catálogo compartilhado, categorias de Rede e Consolidado integral | Permissões distintas de Rede. L02 concede ao dono. Admin recebe relatório das suas unidades. Concessão de alcance integral ou escrita compartilhada a admin depende de autorização explícita de Rede. |
| Plano exclusivo | Admin com permissão de catálogo da unidade, após cadastro e distribuição de planos locais. A autorização comercial e a autorização de entrada têm regras distintas. |
| Desativar vínculo local | Admin e dono podem desativar o vínculo da unidade selecionada conforme escopo e hierarquia. As sessões do usuário são revogadas e os demais vínculos são preservados. |
| Campanhas e suporte master | Regras aprovadas, fluxos pendentes. Consulte a [DN-3 nos requisitos](requisitos-base.md#dn-3--permissões-operacionais-do-l02). |

### Pendências fora das decisões aprovadas da DN-3

- Gerente vê financeiro completo, resumo financeiro ou nenhum financeiro?
- `platform_admin` em produção pode ver financeiro de todas as Redes ou apenas suporte técnico sem visibilidade financeira global?
- `owner` e `admin` terão exatamente o mesmo acesso financeiro?
- Admin pode criar Unidade/Matriz/Filial ou isso fica restrito a owner/platform_admin?
- Liberação manual de acesso será permitida para recepção/gerente ou somente operador_acesso/admin/owner?

## 9. Critérios de aceite

A matriz estará aprovada quando:

- Cada perfil tiver responsabilidades claras.
- Financeiro estiver restrito.
- Histórico de Atividades estiver protegido.
- Onboarding da Rede estiver limitado à plataforma.
- Escopo Rede/Unidade estiver explícito.
- Rotas sensíveis dependerem do backend.
- Testes por perfil puderem ser derivados diretamente da matriz.
- Casos de uso UML puderem ser derivados diretamente da matriz.
- Pendências de decisão estiverem resolvidas ou formalmente aceitas como bloqueio antes de produção.
- Sidebar, rotas frontend e rotas backend forem revisadas contra esta matriz.
