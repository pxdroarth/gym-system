# Modo de Trabalho com Codex

## Modelo operacional

```txt
ChatGPT = arquiteto / engenheiro principal / revisor técnico
Codex   = executor técnico supervisionado
Usuário = integrador / validador / dono do produto
```

## Fluxo

1. Definir bloco
2. Definir objetivo
3. Definir escopo
4. Definir fora de escopo
5. Definir arquivos esperados
6. Definir restrições
7. Definir validações obrigatórias
8. Codex executa
9. Codex retorna diff/relatório
10. ChatGPT revisa arquitetura, regressões, riscos e validações

## Filosofia

Preferir:

- blocos pequenos
- diffs controlados
- migrações graduais
- wrappers temporários
- compatibilidade incremental
- smoke frequente
- documentação viva
- reversibilidade

Evitar:

- refactor gigante
- overengineering
- microservices prematuros
- event-driven cedo demais
- abstração sem benefício real
- enterprise theater
- quebra de compatibilidade sem transição

## Matriz de decisão arquitetural

Antes de propor solução, avaliar:

1. complexidade atual
2. complexidade futura
3. custo operacional
4. custo cognitivo
5. manutenção
6. risco de regressão
7. escalabilidade real necessária
8. impacto em auditoria/segurança
9. impacto em multi-tenant
10. compatibilidade incremental

Regra principal:

```txt
A solução mais sofisticada não é automaticamente a melhor.
```

Critério:

```txt
menor complexidade que sustenta a próxima fase com segurança
```
