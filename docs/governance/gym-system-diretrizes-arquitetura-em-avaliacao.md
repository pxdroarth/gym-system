# Gym System — diretrizes de arquitetura em avaliação

Registro da conversa de 10/11/2026, com as decisões aprovadas em 20/11/2026 na seção [Decisões de arquitetura](#decisões-de-arquitetura-aprovadas-em-20112026). As notas de 10/11 preservam objetivos e preferências do proprietário. As decisões de 20/11 orientam o planejamento dos lotes; nenhuma mudança de código, banco ou hospedagem foi executada por este registro.

## Objetivo do produto

Pedro Arthur Maia Damasceno pretende evoluir o Gym System como SaaS de longo prazo e usar padrões consistentes entre vários produtos. Prioriza organização, manutenção, confiabilidade e capacidade de crescimento. Já utilizou NestJS em outros projetos e gostou da experiência; também aprecia Express e tem familiaridade com Node.

## Preferências e opções discutidas

- Interface React distribuída em aplicativo Electron para Windows. A motivação principal é a facilidade de implantação presencial nas academias, instalação, acesso cotidiano e atualização do produto. O proprietário também realiza a implantação operacional.
- Operação central online: aplicativo cliente consome uma API hospedada, mantendo dados e controles de acesso no servidor. A preferência pelo desktop não constitui requisito de funcionamento offline.
- TypeScript é uma evolução desejada do backend JavaScript. A programação anterior o posicionava depois do L05; esta conversa não modifica esse marco.
- NestJS está sendo considerado para padronizar módulos, controllers, serviços, validações e dependências. Pode usar Express como adaptador HTTP, executando no Node.js.
- PostgreSQL hospedado no Supabase é uma opção de evolução. Recursos vetoriais foram mencionados como interesse futuro, sem caso de uso ou adoção definidos.
- Prisma permanece uma opção a estudar para persistência e migrations; sua adoção não foi decidida.
- Hospedagem da API em VPS e futura conteinerização com Docker fazem parte da visão discutida. O proprietário deseja administrar o ambiente a partir do Windows.
- Ambientes de desenvolvimento reproduzíveis em diferentes computadores são um objetivo: versões, dependências e configuração consistentes. As ferramentas concretas ainda serão escolhidas.

## Atualizações e distribuição

O proprietário deseja distribuir atualizações do aplicativo por versões publicadas, possivelmente no GitHub Releases, com aviso ou comando na interface. Isso exige configurar empacotamento e atualização; um commit ou push isolado não atualiza instalações.

As atualizações têm ciclos distintos:

1. API e regras hospedadas: publicação central, mantendo compatibilidade com os clientes existentes.
2. Interface React: se empacotada localmente, normalmente exige atualizar o aplicativo; se carregada de hospedagem, pode ser publicada centralmente, com controles de segurança e compatibilidade.
3. Electron, integrações nativas e dependências embarcadas: precisam de novas versões do aplicativo mesmo com interface remota.

GitHub é uma possibilidade de distribuição; acesso a repositórios privados e credenciais no cliente exigem desenho próprio. Não foi escolhido um atualizador.

## Arquitetura ainda em discussão

O proprietário não aprovou a proposta de monólito modular e expressou preocupação com escalabilidade, pensando em um produto grande e continuamente evolutivo. Isso não equivale a aprovação de microserviços. Topologia, fronteiras de serviços e estratégia de escala permanecem abertas.

Como esclarecimento técnico, uma aplicação modular também pode evoluir e ter múltiplas réplicas; serviços independentes permitem escala e publicação seletivas, com custos adicionais de comunicação e consistência. Docker empacota e executa componentes, sem determinar essa escolha arquitetural.

## Limites preservados

- A conversa é exploratória. O proprietário recusou preparar agora uma sequência operacional de migração.
- Não alterar o lote de permissões em andamento com base nestas notas.
- NestJS oferece estrutura e mecanismos; autenticação, autorização, isolamento entre redes/unidades, transações e auditoria continuam exigindo implementação e evidências.
- Nenhuma mudança de código, banco, hospedagem ou implantação foi executada neste registro.

## Decisões de arquitetura aprovadas em 20/11/2026

Decididas pelo proprietário em conversa com o Claude. Cada decisão vale para o planejamento a partir do L05; o L04 segue na pilha atual.

### ADR-001 · Topologia: central modular e API local de acesso

- **Contexto.** O produto deve crescer como SaaS e integrar equipamentos e serviços de vários fornecedores. O acesso precisa funcionar na academia mesmo sem internet. O estorno de venda e outros fluxos financeiros dependem de uma transação única.
- **Decisão.** Arquitetura mista e modular.
  - **API central (SaaS, hospedada):** login de todos os usuários, cadastros, planos, cobrança, vendas, estoque, financeiro, fechamento, relatórios e gestão remota das redes e unidades. É um monólito modular, com fronteiras por domínio, escalado por réplicas sobre o PostgreSQL. É a fonte da verdade de cadastro, cobertura e pagamento.
  - **API local de acesso (em cada academia):** decide as entradas, aplica os plugins de catraca, cartão, biometria e reconhecimento facial e guarda em disco local a lista de quem pode entrar e o histórico de entradas e recusas. É a fonte da verdade dos registros de entrada.
  - A regra de decisão de acesso (cobertura, tolerância zero, dependentes) é um módulo compartilhado entre as duas APIs, escrito uma única vez.
- **Critérios para separar outro serviço da central:** necessidade de escala própria, ciclo de publicação próprio ou falhas que não podem derrubar o restante. Candidatos: webhooks de gateways, envio de mensagens e emissão fiscal.
- **Consequências.** Sincronização entre central e academia, credencial de dispositivo por unidade revogável pela central e atualização automática da API local. Para validar sessões sem internet, a API local precisará de tokens assinados ou de credencial própria do dispositivo da recepção.

### ADR-002 · Plugins de integração

- **Decisão.** Integrações entram como plugins com contrato estável por categoria, mantidos pelo proprietário e pela equipe no repositório. Plugins de serviços da internet (pagamento, Pix, mensagens, fiscal) rodam na API central. Plugins de equipamentos da rede da academia rodam na API local de acesso. Um fornecedor novo exige só o plugin do modelo, sem alterar o módulo que o usa.
- **Ordem:** Acesso e Pagamentos primeiro, por fazerem parte do piloto. Depois Mensagens e, por fim, Fiscal.
- **Fora do escopo agora:** SDK público e catálogo de plugins de terceiros.

### ADR-003 · Acesso sem internet

- **Decisão.** A API local decide pela cópia local de coberturas, credenciais, horários e bloqueios, com ou sem internet. A cópia vale por **24 horas** sem sincronizar; depois disso, só liberação manual registrada.
- **Histórico.** As entradas são enviadas à central **em lote** (por exemplo, a cada 5 minutos ou quando a conexão volta), sem uma chamada por passagem na catraca. A central mantém o histórico completo para relatórios, perfil do aluno e alertas.
- **Pagamento durante a queda.** Só é reconhecido pela API local após a sincronização; até lá, a recepção libera manualmente com registro.

### ADR-004 · Migração de tecnologia

- **Momento.** Depois da homologação do piloto (L05). O L04 termina na pilha atual.
- **Ordem.** Primeiro o PostgreSQL, trocando a camada de banco (`dbHelper` e o SQL) com os smokes e o Playwright como garantia. Depois TypeScript e NestJS, módulo a módulo, com as rotas Express atuais rodando dentro do NestJS durante a transição.
- **Banco gerenciado.** Supabase usado como PostgreSQL gerenciado. A autenticação atual continua até haver motivo para trocar. Recursos vetoriais ficam fora até existir caso de uso.
- **Persistência.** Prisma ou construtor de consultas decidido na migração para TypeScript, preservando as atualizações condicionais que garantem uso único de aprovações e idempotência.

### ADR-005 · Interface única web

- **Decisão.** Uma única interface web responsiva, em formato de aplicativo, para navegador, celular e desktop. O Electron é a casca desktop da mesma interface na recepção e hospeda a API local de acesso quando necessário.
- **Celular.** No primeiro momento, instalação pelo navegador ("Adicionar à tela inicial"). Publicação nas lojas fica como atualização futura, empacotando a mesma interface.
- **App do aluno.** Depois do piloto final, como atualização futura do SaaS, avaliando a integração com um aplicativo existente cujo desenvolvedor o proprietário conhece.
- **Atualizações.** API e interface são publicadas centralmente. A casca Electron e a API local recebem versões próprias, por exemplo pelo GitHub Releases com atualização automática; o mecanismo será escolhido no lote correspondente.

### ADR-006 · Rotinas agendadas e backup

- **Decisão.** Rotinas agendadas (node-cron ou equivalente) para backup, sincronização, envio das entradas em lote, vencimentos e limpeza.
  - **Central:** backup do provedor e, além dele, `pg_dump` diário criptografado em armazenamento separado do provedor. A rotina roda uma única vez mesmo com várias réplicas da API (worker único ou trava).
  - **Academia:** cópia segura do banco local a cada poucas horas, com versões no próprio computador. A sincronização com a central funciona como cópia externa.
  - **Retenção:** 7 diárias, 4 semanais e 12 mensais.
  - **Recuperação:** perda máxima de 24 horas de dados e retorno em até 4 horas, revisáveis no L14.
  - **Verificação:** teste periódico de restauração em base descartável e alerta ao proprietário quando uma rotina falhar.

## Referências técnicas

- https://docs.nestjs.com/
- https://docs.nestjs.com/providers
- https://www.electronjs.org/docs/latest/tutorial/process-model
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/tutorial/updates
- https://supabase.com/docs/guides/database/overview
