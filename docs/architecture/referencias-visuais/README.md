# Referências Visuais de Arquitetura

Esta pasta documenta o papel das referências visuais antigas do Sistema Academia SA. No momento da auditoria, os arquivos visuais estão em `docs/diagramas/`; este README é o ponto arquitetural recomendado para entender como usar esse material.

## Status dos diagramas antigos

Os diagramas antigos são referência visual e histórica. Eles ajudam a entender decisões, hipóteses e leituras anteriores, mas não são fonte oficial única.

Eles não substituem:

- [Requisitos base](../../governance/requisitos-base.md)
- [Matriz de permissões](../../governance/matriz-permissoes.md)
- Fontes PlantUML em [UML](../../uml/README.md)
- Schema-freeze antes de migrations
- Validação real de permissões no backend

## Relação com PlantUML

Os diagramas PlantUML atuais devem ser mantidos em `docs/uml/sources/` e exportados para SVG/PNG quando necessário.

As imagens em `docs/diagramas/` podem orientar refinamentos de UML, mas qualquer evolução oficial deve passar pelos `.puml` versionáveis.

## Arquivos históricos em `docs/diagramas/`

- `Diagrama de contexto do backend.png`
- `Diagrama de evolução de persistência.png`
- `Diagrama de módulos do backend.png`
- `Fluxo de decisão de acesso.png`
- `Máquina de estados de acesso.png`
- `Máquina de estados de mensalidade.png`
- `notasextras.txt`

## Acesso e integrações

Hikvision/catraca é integração futura. A fase atual deve ser tratada como webcam local/simulação, mantendo o provider de acesso desacoplado para permitir evolução posterior sem prender o domínio a um fornecedor específico.

## Banco e evolução

SQLite é o banco atual. A migração SQLite -> PostgreSQL é futura e deve ser precedida por:

- revisão de requisitos;
- congelamento da matriz de permissões;
- schema-freeze;
- revisão de auditoria;
- planejamento de migrations;
- smoke tests documentados.

## Regra de uso

Use estes diagramas como apoio visual, não como contrato único. Nenhum diagrama antigo substitui requisitos-base, matriz de permissões, schema-freeze, migrations ou testes reais.
