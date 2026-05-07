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

### gerente

Perfil de gestão operacional intermediária. Pode acompanhar operação, alunos, mensalidades, produtos e vendas.

Financeiro completo deve ser restrito ou parcial conforme decisão de negócio. Não acessa onboarding global e não altera configurações críticas de plataforma.

### recepção

Perfil de atendimento diário. Pode consultar/cadastrar alunos e apoiar rotinas operacionais.

Não deve acessar financeiro completo. Não deve acessar Histórico de Atividades completo. Registro de pagamento é uma decisão sensível: se permitido, deve ser operacional, limitado e auditado. Enquanto não houver decisão final, permanece como pendente.

### operador_acesso

Perfil focado em acesso/catraca. Pode verificar status e registrar/liberar acesso conforme regra.

Não deve acessar financeiro. Não deve registrar pagamento por padrão. Não deve acessar Histórico de Atividades, onboarding, Consolidado da Rede ou administração.

## 5. Matriz por módulo

| Módulo | platform_admin | owner | admin | gerente | recepção | operador_acesso | Observações |
|---|---|---|---|---|---|---|---|
| Dashboard operacional | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Leitura/Operação limitada | Leitura limitada | Dashboard comum não deve expor financeiro restrito. |
| Consolidado da Rede | Total | Leitura / Escopo Rede | Leitura / Escopo Rede | Leitura / Pendente | Não permitido | Não permitido | Consolidado é somente leitura. |
| Onboarding da Rede | Total | Não permitido | Não permitido | Não permitido | Não permitido | Não permitido | Onboarding é interno da plataforma. |
| Usuários internos | Total | Escopo Rede | Escopo Rede/Unidade | Não permitido | Não permitido | Não permitido | Alterar papel/status é ação crítica. |
| Alunos | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Leitura limitada | Recepção pode cadastrar/consultar conforme fluxo operacional. |
| Perfil do aluno | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Leitura limitada | Operador deve ver apenas o necessário para acesso. |
| Planos | Total | Escopo Rede | Escopo Rede/Unidade | Leitura / Pendente | Leitura | Não permitido | Edição de plano é administrativa. |
| Associações/vínculos | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Não permitido | Impacta acesso e mensalidade. |
| Mensalidades | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Leitura limitada | Cancelamento é ação crítica. |
| Pagamentos | Total | Escopo Rede | Escopo Rede/Unidade | Pendente | Pendente | Não permitido | Recepção/gerente exigem decisão final. |
| Produtos | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Não permitido | Alteração de estoque é sensível. |
| Vendas | Total | Escopo Rede | Escopo Rede/Unidade | Escopo Unidade | Operação limitada | Não permitido | Cancelamento/reversão exige auditoria. |
| Financeiro | Total / Observação produção | Escopo Rede | Escopo Rede/Unidade / Pendente | Pendente | Não permitido | Não permitido | Módulo restrito. |
| Plano de contas | Total / Observação produção | Escopo Rede | Escopo Rede/Unidade / Pendente | Não permitido | Não permitido | Não permitido | Configuração financeira sensível. |
| Contas financeiras | Total / Observação produção | Escopo Rede | Escopo Rede/Unidade / Pendente | Pendente | Não permitido | Não permitido | Pagar conta financeira é ação crítica. |
| Fechamento mensal | Total / Observação produção | Escopo Rede | Pendente | Não permitido | Não permitido | Não permitido | Reabrir fechamento exige decisão final. |
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
| cadastrar aluno | owner, admin, gerente, recepção | Rede/Unidade | Sim | Recepção deve operar em escopo limitado. |
| editar aluno | owner, admin, gerente, recepção | Rede/Unidade | Sim | Campos sensíveis podem exigir restrição futura. |
| alterar plano | owner, admin | Rede/Unidade | Sim | Gerente é pendente. |
| criar mensalidade | owner, admin, gerente | Rede/Unidade | Sim | Recepção é pendente se fluxo operacional exigir. |
| pagar mensalidade | owner, admin | Rede/Unidade | Sim | Recepção/gerente pendentes; se permitido, limitar e auditar. |
| cancelar mensalidade | owner, admin | Rede/Unidade | Sim | Ação sensível; deve respeitar fechamento mensal. |
| reverter pagamento | owner, admin | Rede/Unidade | Sim | Quem pode executar reversão controlada ainda exige decisão final. |
| registrar venda | owner, admin, gerente, recepção | Rede/Unidade | Sim | Recepção pode operar venda se o fluxo estiver autorizado. |
| cancelar/reverter venda | owner, admin | Rede/Unidade | Sim | Reversão/cancelamento é sensível. |
| alterar estoque | owner, admin, gerente | Rede/Unidade | Sim | Recepção não deve alterar estoque por padrão. |
| criar produto | owner, admin, gerente | Rede/Unidade | Sim | Pode exigir aprovação administrativa em produção. |
| editar produto | owner, admin, gerente | Rede/Unidade | Sim | Alterações de preço/estoque são sensíveis. |
| acessar financeiro | platform_admin, owner, admin | Global/Rede/Unidade | Sim | Platform_admin global em produção é decisão pendente. |
| criar conta financeira | owner, admin | Rede/Unidade | Sim | Gerente é pendente. |
| pagar conta financeira | owner, admin | Rede/Unidade | Sim | Ação financeira sensível. |
| reabrir fechamento mensal | owner, admin / Pendente | Rede/Unidade | Sim | Decisão final pendente. |
| liberar acesso manualmente | platform_admin, owner, admin, operador_acesso | Rede/Unidade | Sim | Gerente/recepção pendentes conforme operação. |
| ver Histórico de Atividades | platform_admin, owner, admin | Global/Rede/Unidade | Não altera dados | Somente leitura; bloqueado para perfis operacionais. |
| ver Consolidado da Rede | platform_admin, owner, admin | Global/Rede | Não altera dados | Somente leitura. |

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

## 8. Pendências de decisão

- Recepção pode ou não registrar pagamento?
- Gerente vê financeiro completo, resumo financeiro ou nenhum financeiro?
- `platform_admin` em produção pode ver financeiro de todas as Redes ou apenas suporte técnico sem visibilidade financeira global?
- `owner` e `admin` terão exatamente o mesmo acesso financeiro?
- Quem pode reabrir fechamento mensal?
- Quem pode executar reversão controlada?
- Admin pode criar Unidade/Matriz/Filial ou isso fica restrito a owner/platform_admin?
- Gerente pode criar/editar planos ou apenas consultar?
- Recepção pode criar mensalidade ou apenas consultar/encaminhar pagamento?
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
