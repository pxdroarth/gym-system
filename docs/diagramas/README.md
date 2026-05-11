# Diagramas Visuais Históricos

Esta pasta reúne diagramas visuais antigos do Sistema Academia SA. Eles continuam úteis como referência histórica e arquitetural, mas não são a fonte oficial única da documentação atual.

O ponto recomendado para entender o uso dessas referências é:

- [Referências visuais de arquitetura](../architecture/referencias-visuais/README.md)

## Arquivos

- `Diagrama de contexto do backend.png`
- `Diagrama de evolução de persistência.png`
- `Diagrama de módulos do backend.png`
- `Fluxo de decisão de acesso.png`
- `Máquina de estados de acesso.png`
- `Máquina de estados de mensalidade.png`
- `notasextras.txt`

## Como usar

- Use como apoio visual para arquitetura, acesso, mensalidades e evolução de persistência.
- Use os PlantUML em `../uml/sources/` como fonte versionável oficial para UML.
- Use `../governance/requisitos-base.md` e `../governance/matriz-permissoes.md` como referência principal de requisitos e permissões.

## Avisos

- Estes diagramas não substituem schema-freeze, requisitos-base, matriz de permissões ou validação real no backend.
- SQLite é o banco atual; PostgreSQL é evolução futura.
- Hikvision/catraca é integração futura; a fase atual considera webcam local/simulação.
- Decisões visuais antigas devem ser revisadas antes de virar requisito oficial.
