# UML - Sistema Academia SA

Este diretório reúne os diagramas UML do Sistema Academia SA. Os diagramas apoiam manutenção, backlog, testes, revisão de permissões, auditoria, schema-freeze e preparação para PostgreSQL/deploy web.

## Relação com a governança

Os diagramas devem ser lidos junto com:

- [Requisitos base](../governance/requisitos-base.md)
- [Matriz de permissões](../governance/matriz-permissoes.md)

Em caso de conflito, requisitos, matriz de permissões e validação real no backend prevalecem sobre qualquer diagrama visual.

## Estrutura esperada

- `sources/`: fontes PlantUML `.puml` versionáveis e oficiais.
- `svg/`: artefatos visuais exportados em SVG.
- `png/`: artefatos visuais exportados em PNG, quando existirem.
- `sistema-academia-uml.zip`: pacote opcional/gerado para distribuição.

O ZIP não deve ser tratado como fonte oficial única. A fonte versionável deve ser o arquivo `.puml` em `sources/`.

## Diagramas atuais

- `01-casos-uso.puml`: visão geral de atores, módulos e casos de uso.
- `02-sequencia-login-refresh.puml`: login, token opaco, refresh cookie HttpOnly, rotação e reuso bloqueado.
- `03-sequencia-pagamento.puml`: pagamento de mensalidade.
- `04-sequencia-acesso.puml`: verificação/liberação de acesso.
- `05-classes-dominio.puml`: modelo conceitual de domínio.
- `06-atividade-rotina-operacional.puml`: rotina operacional diária.
- `07-estados-mensalidade.puml`: estados de mensalidade.
- `08-estados-sessao-refresh.puml`: estados de sessão e refresh token.
- `09-componentes-arquitetura.puml`: componentes de arquitetura.

Os SVGs presentes em `svg/sources/` são artefatos visuais oficiais exportados a partir das fontes PlantUML, úteis para leitura rápida e portfólio.

## Visualizar no VS Code

Instale:

- Extensão PlantUML para VS Code.
- Java Runtime.
- Graphviz, quando o diagrama exigir layout com Graphviz.

Abra um arquivo `.puml` em `docs/uml/sources/` e use o preview da extensão PlantUML.

## Exportar SVG/PNG

Com `plantuml.jar` disponível:

```bash
java -jar plantuml.jar -tsvg -o ../svg docs/uml/sources/*.puml
java -jar plantuml.jar -tpng -o ../png docs/uml/sources/*.puml
```

Com `plantuml` instalado globalmente:

```bash
plantuml -tsvg -o ../svg docs/uml/sources/*.puml
plantuml -tpng -o ../png docs/uml/sources/*.puml
```

## Uso recomendado

- Backlog: derivar épicos, histórias e pendências dos casos de uso.
- Testes: montar smoke tests e testes por perfil a partir de fluxos e permissões.
- Segurança: revisar autenticação, refresh token, auditoria e escopo.
- Banco: apoiar schema-freeze antes de migrations para PostgreSQL.
- Portfólio: usar SVGs como leitura visual, sem substituir os `.puml`.

## Avisos

- PostgreSQL é evolução futura; SQLite é o banco atual.
- Electron é etapa final/opcional, não o modo principal atual.
- Hikvision/catraca é integração futura; a fase atual considera webcam local/simulação.
- Diagramas não substituem `schema-freeze`, matriz de permissões, requisitos-base ou testes reais.
