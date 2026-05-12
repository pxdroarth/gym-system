# Testes de Carga com JMeter

JMeter será usado futuramente para testes de carga mais visuais, com plano `.jmx` e relatório HTML.

Não será criado plano pesado nesta sprint e JMeter não será instalado nesta etapa.

## Cenários futuros

- login concorrente
- consulta de alunos
- pagamentos
- acessos
- dashboard
- auditoria

## Comando futuro

```bash
jmeter -n -t tests/jmeter/sistema-academia-load.jmx -l tests/jmeter/results.jtl -e -o tests/jmeter/report
```

Status: pendente.
