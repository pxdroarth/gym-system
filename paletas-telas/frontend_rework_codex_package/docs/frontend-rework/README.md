# Frontend Rework Package

Pacote de referências visuais para orientar evolução incremental do frontend do Sistema Academia SA.

## Estrutura

- `telas/`: referências visuais principais por módulo.
- `paleta/`: base cromática institucional.
- `referencias/`: documentos de apoio para implementação.
- `extras/`: variações ou arquivos auxiliares.

## Uso

- As telas são referência visual, não especificação rígida de pixel.
- Em caso de conflito entre mockup e regra de negócio, a regra de negócio prevalece.
- O sistema deve evoluir incrementalmente, sem reescrita destrutiva.
- O módulo financeiro continua separado da dashboard operacional comum.
- O Consolidado da Rede continua somente leitura.
- Operação diária ocorre por Unidade; governança e consolidação ocorrem por Rede.

## Relação com a documentação atual

As decisões oficiais devem ser conferidas em:

- `../../../../docs/governance/requisitos-base.md`
- `../../../../docs/governance/matriz-permissoes.md`
- `../../../../docs/uml/README.md`

Termos técnicos como `tenant` e `unit` podem aparecer no código ou em referências antigas, mas a documentação de produto prioriza Rede e Unidade.
