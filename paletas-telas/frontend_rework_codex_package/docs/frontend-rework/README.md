# Frontend Rework Package

Pacote organizado para orientar implementação do novo front-end no Codex.

## Estrutura
- `telas/`: referências visuais principais por módulo
- `paleta/`: gradiente e base cromática institucional
- `referencias/`: documentos de apoio para implementação
- `extras/`: variações ou arquivos auxiliares

## Observações
- As telas são referência visual, não especificação rígida de pixel.
- Em caso de conflito entre mockup e regra de negócio, a regra de negócio prevalece.
- O sistema deve evoluir incrementalmente, sem reescrita destrutiva.
- O módulo financeiro continua separado da dashboard operacional comum.
- O consolidado do tenant continua somente leitura.
- Operação continua por unidade (`unit`) e governança/consolidação por tenant.
