# Governança - Sistema Academia SA

Esta pasta concentra os documentos que orientam decisões de produto, permissões, testes, UML, auditoria, schema-freeze e migração futura para PostgreSQL.

## Ordem recomendada de leitura

1. [Requisitos base](requisitos-base.md)
2. [Matriz de permissões](matriz-permissoes.md)
3. [UML](../uml/README.md)
4. [Referências visuais de arquitetura](../architecture/referencias-visuais/README.md)
5. [Auditoria dos READMEs](readme-audit.md)

## Documentos

| Documento | Função | Status |
|---|---|---|
| `requisitos-base.md` | Define visão do produto, escopo, requisitos funcionais, segurança, auditoria, dados, testes e pendências antes do PostgreSQL. | Parcial: já cobre a fase atual e pendências principais. |
| `matriz-permissoes.md` | Define visibilidade, operação, escopo e ações críticas por perfil. | Parcial: há decisões pendentes antes de produção. |
| `readme-audit.md` | Registra auditoria dos READMEs e decisões desta revisão documental. | Feito nesta revisão. |

## Como usar estes documentos

- Backlog: requisitos e pendências viram épicos, histórias e critérios de aceite.
- UML: diagramas devem refletir requisitos-base e matriz de permissões.
- Testes: smoke tests e testes por perfil devem nascer da matriz e dos fluxos UML.
- Permissões: frontend pode ocultar UI, mas o backend deve ser a autoridade final.
- Auditoria: eventos críticos devem preservar ator, ação, data, antes/depois quando aplicável e metadata.
- Schema-freeze: requisitos, permissões e auditoria devem estar revisados antes de migrations.
- Migrations: PostgreSQL é futuro e deve ser planejado após congelamento de schema e validação dos fluxos críticos.

## Status geral

- Feito: base de requisitos, matriz inicial, autenticação com token opaco server-side, Bloco 3A de refresh token backend com cookie HttpOnly, bootstrap SQLite limpo, documentação UML inicial.
- Parcial: escopo Rede/Unidade, segurança de sessão ponta a ponta, auditoria B1/B2/B3, permissões finais por perfil, smoke tests repetíveis.
- Pendente: `.env.example`, schema-freeze, migrations, hardening de produção, remoção de dependência de `localStorage` para access token em produção.
- Futuro: PostgreSQL, deploy web, integração real com catraca/Hikvision, Electron opcional.

## Princípios

- Documentação deve separar claramente atual, pendente e futuro.
- Dados atuais são fictícios/teste.
- Produção comercial real não deve ser presumida.
- Diagramas visuais não substituem requisitos, matriz de permissões, testes ou validação no backend.
