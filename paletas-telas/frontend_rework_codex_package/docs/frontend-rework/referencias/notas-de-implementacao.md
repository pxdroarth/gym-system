# Notas de implementação

## Regras de negócio que não podem ser quebradas
- tenant = academia cliente
- unit = filial/unidade operacional
- operação é por unidade
- consolidado do tenant é somente leitura
- financeiro é separado da dashboard operacional comum
- platform_admin é diferente de owner/admin do tenant
- modais continuam robustos via portal quando aplicável
- auth, currentUnit, allowedUnits, RoleGate e ProtectedRoute devem ser preservados

## Estratégia obrigatória
- evolução incremental
- sem reescrita total
- sem quebra de contratos
- reutilizar componentes existentes antes de criar novos
- se houver conflito entre referência visual e domínio real, priorizar domínio real
