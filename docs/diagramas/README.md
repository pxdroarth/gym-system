# Referências Visuais de Arquitetura

Esta pasta reúne diagramas visuais já existentes no projeto. Eles representam decisões, entendimentos e leituras anteriores sobre o Sistema Academia SA e continuam úteis como referência histórica e arquitetural.

## Status dos arquivos

Estes arquivos são **referências visuais**, não a fonte oficial única da documentação atual. Eles não devem substituir:

- `docs/governance/requisitos-base.md`
- `docs/governance/matriz-permissoes.md`
- fontes PlantUML em `docs/uml/sources`
- schema-freeze antes da migração para PostgreSQL
- validação real de permissões no backend

## Relação com a documentação UML

Os arquivos PlantUML em `docs/uml/sources` passam a ser a documentação UML versionável daqui para frente. Sempre que um diagrama oficial precisar evoluir, a fonte principal deve ser o `.puml`, não uma imagem editada manualmente.

Os diagramas desta pasta podem e devem ser usados como insumo para refinar os diagramas oficiais, especialmente quando trazem decisões visuais mais claras do que a primeira versão em PlantUML.

## Uso recomendado por arquivo

| Arquivo | Status | Uso recomendado |
|---|---|---|
| `Diagrama de contexto do backend.png` | Referência visual arquitetural | Apoia a visão da arquitetura atual do backend e deve ser comparado com `docs/uml/sources/09-componentes-arquitetura.puml`. |
| `Diagrama de evolução de persistência.png` | Referência visual de evolução técnica | Apoia a futura migração SQLite -> PostgreSQL e deve ser considerado durante schema-freeze e planejamento de migrations. |
| `Diagrama de módulos do backend.png` | Referência visual modular | Apoia a leitura dos módulos e services atuais do backend. Deve orientar, mas não substituir, análise de código. |
| `Fluxo de decisão de acesso.png` | Referência visual de regra operacional | Deve ser usado como base para refinar diagramas oficiais de atividade e sequência de acesso. |
| `Máquina de estados de acesso.png` | Referência visual de estados | Deve apoiar a evolução dos diagramas oficiais de estados/atividades de acesso. |
| `Máquina de estados de mensalidade.png` | Referência visual de estados | Deve apoiar a evolução do diagrama oficial `docs/uml/sources/07-estados-mensalidade.puml`. |
| `notasextras.txt` | Notas históricas | Deve ser tratado como material auxiliar, sujeito a revisão antes de virar requisito oficial. |

## Integração de acesso

A integração Hikvision deve ser tratada como futura. A fase atual usa webcam local/simulação e deve manter o provider de acesso desacoplado, para permitir evolução posterior sem prender o domínio a um fornecedor específico.

## Regras de governança

- Não considerar estes diagramas como documentação descartada.
- Não tratá-los como substituto da matriz de permissões.
- Não tratá-los como substituto do schema-freeze.
- Não promover uma decisão visual antiga para requisito concluído sem validação.
- Usar estes arquivos como referência para backlog, revisão arquitetural e refinamento dos diagramas PlantUML oficiais.
