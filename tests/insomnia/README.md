# Testes de API com Insomnia

Insomnia será usado para testes manuais e semiautomatizados de API. Coleções exportadas devem ficar nesta pasta.

Ambientes locais com senha real, token real, cookie real ou qualquer segredo não devem ser commitados.

## Estrutura sugerida

- `sistema-academia-smoke.insomnia.json`: coleção exportada, quando criada.
- `local-env.example.json`: exemplo seguro de ambiente local.

## Requests recomendados

- `GET /test-db`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /audit-logs`
- Fluxos futuros: alunos, mensalidades, pagamentos, vendas, acessos.

## Boas práticas

- Use `local-env.example.json` como base e crie um environment local fora do versionamento para credenciais reais.
- Não exporte coleções contendo token, cookie ou senha preenchida.
- Prefira placeholders em requests exportáveis.
