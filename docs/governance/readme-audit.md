# Auditoria dos READMEs - Sistema Academia SA

Auditoria documental executada em 2026-05-11.

## Comando usado

```powershell
Get-ChildItem -Recurse -Filter README*.md
```

O comando encontrou também READMEs de dependências dentro de `node_modules`. Para decisões de documentação do projeto, esses arquivos foram classificados como documentação de terceiros e ignorados na edição.

## READMEs do projeto encontrados

| Caminho | Função atual | Público-alvo | Status | Conflitos encontrados | Mantido | Removido | Movido/realocado |
|---|---|---|---|---|---|---|---|
| `README.md` | Entrada principal do projeto. | Recrutadores, mantenedores, avaliadores técnicos e desenvolvedores. | Desatualizado/parcial. | Mojibake, texto longo demais, foco excessivo em regras internas, ausência de governança centralizada, `.env.example` não esclarecido, risco de leitura como produção pronta. | Stack, scripts reais, `/test-db`, SQLite atual, links para docs. | Texto inflado, árvore antiga com pasta `diagramas` fora do padrão atual, duplicação de regras de negócio. | Regras detalhadas ficam em `docs/governance/requisitos-base.md` e `docs/governance/matriz-permissoes.md`. |
| `docs/diagramas/README.md` | Nota sobre diagramas visuais antigos. | Mantenedores e arquitetura. | Útil, mas em local legado. | O destino solicitado para essa função é `docs/architecture/referencias-visuais/README.md`. | Status histórico dos diagramas, relação com PlantUML, aviso Hikvision futuro. | Nada removido. | Conteúdo conceitual replicado/normalizado em `docs/architecture/referencias-visuais/README.md`. |
| `docs/uml/README.md` | Guia dos diagramas UML. | Mantenedores, arquitetura, QA e portfólio. | Parcial. | Tratava ZIP e fontes sem deixar forte que `.puml` é a fonte oficial; fontes `.puml` estavam apenas dentro do ZIP. | Lista dos diagramas, relação com governança, comandos PlantUML. | Ambiguidade sobre ZIP como fonte prática. | Fontes `.puml` foram extraídas para `docs/uml/sources/`; ZIP ficou como artefato opcional. |
| `frontend/README.md` | README específico do frontend. | Desenvolvedores frontend. | Desatualizado. | Conteúdo padrão Create React App; citava porta `3000`, `npm test` e `eject`, que não existem no `frontend/package.json`. | Função de README curto do frontend. | Instruções CRA, scripts inexistentes e porta incorreta como padrão. | Visão geral do projeto fica no README da raiz. |
| `paletas-telas/frontend_rework_codex_package/docs/frontend-rework/README.md` | Pacote de referência visual para rework do frontend. | Design/frontend. | Contextual. | Usa termos técnicos `tenant/unit`, mas como referência de rework não contradiz a governança se lido como apoio histórico. | Estrutura do pacote, aviso de referência visual, regra de negócio prevalecendo. | Nada removido. | Permanece como nota contextual do pacote visual. |

## READMEs criados

| Caminho | Função | Público-alvo |
|---|---|---|
| `docs/governance/README.md` | Mapa dos documentos de governança, status e ordem de leitura. | Mantenedores, QA, arquitetura e avaliadores técnicos. |
| `docs/architecture/referencias-visuais/README.md` | Ponto oficial para explicar referências visuais antigas e relação com PlantUML/governança. | Mantenedores, arquitetura e frontend. |
| `docs/governance/readme-audit.md` | Registro da auditoria e das decisões de atualização. | Mantenedores e auditoria documental. |

## Validações realizadas

- `package.json` da raiz conferido.
- `frontend/package.json` conferido.
- `backend/package.json` não existe.
- Pastas `docs/governance`, `docs/uml` e `docs/architecture` conferidas/criadas quando necessário.
- Endpoint `/test-db` conferido em `backend/server.js`.
- Scripts documentados conferidos contra os `package.json`.
- Variáveis de ambiente locais verificadas em `backend/.env` e `frontend/.env`.
- Ausência de `.env.example` registrada como pendência naquele momento; exemplos foram criados posteriormente em `backend/.env.example` e `frontend/.env.example`.
- ZIP de UML tratado como artefato opcional, não fonte oficial.
- Links internos ajustados com caminhos relativos.

## Decisões de atualização

- README da raiz passou a ser a entrada principal, objetiva e executável em ambiente limpo.
- Detalhes extensos de regras de negócio foram referenciados na governança em vez de repetidos na raiz.
- Frontend recebeu README curto e específico para Vite.
- UML passou a explicitar `.puml` como fonte versionável e ZIP como opcional/gerado.
- Referências visuais antigas ganharam ponto oficial em `docs/architecture/referencias-visuais/README.md`.
- A documentação separa atual, pendente e futuro para SQLite, PostgreSQL, Electron, Hikvision e produção.

## Pendências restantes

- Decidir se `docs/diagramas/` deve permanecer como pasta histórica ou ser migrada fisicamente para `docs/architecture/referencias-visuais/`.
- Executar e registrar smoke tests manuais a partir de `docs/governance/smoke-tests.md`.
- Congelar matriz de permissões antes do PostgreSQL.
- Finalizar hardening de sessão no frontend e produção.
- Revisar se o pacote `paletas-telas/frontend_rework_codex_package` continuará no repositório final ou será arquivado como referência histórica.
