# UML — Sistema Academia SA

Este diretório contém a primeira versão dos diagramas UML visuais do Sistema Academia SA em PlantUML.

## Objetivo

Os diagramas documentam a visão funcional, fluxos críticos, domínio conceitual, estados e arquitetura do sistema. Eles são fontes versionáveis para apoiar backlog, testes, casos de uso, revisão de permissões, preparação de migrations e evolução para PostgreSQL/deploy web.

## Relação com a governança

As fontes foram derivadas de:

- `docs/governance/requisitos-base.md`
- `docs/governance/matriz-permissoes.md`

Decisões importantes preservadas:

- Rede, Unidade, Matriz e Filial são termos de produto.
- `tenant` e `unit` ficam como termos técnicos internos quando necessário.
- Consolidado da Rede é somente leitura.
- Histórico de Atividades é módulo visual somente leitura.
- Auditoria é mecanismo técnico.
- Autenticação usa token opaco server-side, não JWT.
- Financeiro é módulo restrito.
- PostgreSQL/deploy web vêm antes de Electron.

## Estrutura

- `sources/`: fontes PlantUML versionáveis.
- `svg/`: saída SVG quando PlantUML estiver disponível.
- `png/`: saída PNG quando PlantUML estiver disponível.
- `sistema-academia-uml.zip`: pacote com fontes, README e imagens geradas quando disponíveis.

## Diagramas

1. `01-casos-uso.puml`: visão geral de atores, módulos e casos de uso.
2. `02-sequencia-login-refresh.puml`: login, access token opaco, refresh cookie HttpOnly, rotação e reuso bloqueado.
3. `03-sequencia-pagamento.puml`: fluxo de pagamento de mensalidade.
4. `04-sequencia-acesso.puml`: verificação/liberação de acesso.
5. `05-classes-dominio.puml`: modelo conceitual de domínio.
6. `06-atividade-rotina-operacional.puml`: rotina operacional diária.
7. `07-estados-mensalidade.puml`: estados de mensalidade.
8. `08-estados-sessao-refresh.puml`: estados de sessão e refresh token.
9. `09-componentes-arquitetura.puml`: componentes de arquitetura.

## Como gerar imagens

Se houver `plantuml.jar` disponível:

```bash
java -jar plantuml.jar -tsvg -o ../svg docs/uml/sources/*.puml
java -jar plantuml.jar -tpng -o ../png docs/uml/sources/*.puml
```

Se o comando `plantuml` estiver instalado globalmente:

```bash
plantuml -tsvg -o ../svg docs/uml/sources/*.puml
plantuml -tpng -o ../png docs/uml/sources/*.puml
```

## Uso recomendado

- Backlog: derivar épicos e histórias dos casos de uso e ações críticas.
- Testes: criar smoke tests e testes por perfil a partir dos fluxos e permissões.
- Migrations: usar o modelo conceitual como apoio para revisão de schema antes do PostgreSQL.
- Segurança: revisar fluxos de sessão, refresh e Auditoria contra os requisitos.
- UML futuro: detalhar casos de uso por módulo quando a matriz de permissões for congelada.
