# Sistema Academia SA

Sistema web para gestão operacional e administrativa de academias. O projeto centraliza cadastros, planos, mensalidades, pagamentos, acessos, produtos, vendas, financeiro restrito, auditoria técnica e governança de Rede/Unidade.

Este repositório está em fase de portfólio e evolução técnica. Os dados atuais são fictícios/teste e não representam operação comercial real.

## Stack atual

- Backend: Node.js + Express.
- Frontend: React + Vite.
- Banco atual: SQLite local.
- Autenticação: token opaco validado server-side, não JWT.
- Refresh token: backend com cookie HttpOnly no Bloco 3A e consumo frontend com `withCredentials` no Bloco 3B.
- Evolução planejada: PostgreSQL e deploy web antes de qualquer empacotamento desktop.
- Electron: etapa final/opcional, não é o modo principal atual.

## Estado atual

- API Express executada pela raiz do projeto.
- Frontend Vite em pasta própria.
- SQLite local com `ensureSchema`/bootstrap na inicialização do backend.
- Bootstrap SQLite limpo já corrigido.
- Governança documentada em requisitos, matriz de permissões e UML.
- Integração Hikvision/catraca é futura; a fase atual considera webcam local/simulação.
- Produção comercial real ainda não está declarada como pronta.

## Estrutura principal

```text
sistema-academia-main/
├── backend/
│   ├── database/
│   ├── routes/
│   ├── services/
│   └── server.js
├── frontend/
│   ├── src/
│   └── package.json
├── docs/
│   ├── governance/
│   ├── uml/
│   ├── architecture/referencias-visuais/
│   └── diagramas/
├── package.json
└── README.md
```

## Instalação em ambiente limpo

Requisitos esperados:

- Node.js e npm instalados.
- Java e Graphviz apenas se for exportar diagramas PlantUML localmente.
- Versao de Node padronizada em `.nvmrc` e espelhada em `.node-version`.

Antes de instalar dependencias em um PC novo, valide as versoes:

```cmd
tests\scripts\check-versions.cmd
```

Na raiz do projeto:

```bash
npm install
```

No frontend:

```bash
cd frontend
npm install
```

## Rodar o backend

Na raiz do projeto:

```bash
npm start
```

Comando equivalente disponível:

```bash
npm run backend
```

A API sobe em:

```text
http://localhost:3001
```

## Rodar o frontend

Na raiz do projeto:

```bash
npm run frontend
```

Ou dentro da pasta `frontend`:

```bash
cd frontend
npm run dev
```

O Vite usa normalmente:

```text
http://localhost:5173
```

O script `npm start` dentro de `frontend` também executa Vite.

## Teste rápido do banco

Com o backend rodando:

```bash
curl http://localhost:3001/test-db
```

Resposta esperada:

```json
{
  "db_time": "..."
}
```

Esse endpoint consulta o SQLite local e confirma que a API conseguiu acessar o banco.

## Portas

- Backend/API: `3001`.
- Frontend Vite: `5173`.
- CORS local aceito pelo backend: `http://localhost:3000` e `http://localhost:5173`.

## Banco local e dados

- O banco atual é SQLite local.
- O backend executa `ensureSchema` na inicialização.
- O bootstrap cria/ajusta dados mínimos para ambiente local quando necessário.
- Dados presentes no projeto devem ser tratados como fictícios/teste.
- PostgreSQL é objetivo futuro para deploy web/SaaS, não o banco atual.

## Variáveis de ambiente

Existem arquivos locais:

- `backend/.env`
- `frontend/.env`

Exemplos seguros foram adicionados para ambiente limpo:

- `backend/.env.example`
- `frontend/.env.example`

Observação importante: o backend atual não carrega `.env` automaticamente por código, pois não há `dotenv` configurado. Para usar variáveis no backend hoje, defina-as no shell/processo antes de rodar `npm start`. O frontend Vite carrega variáveis `VITE_*` quando o `.env` está na pasta `frontend`.

Variáveis relevantes observadas:

- Backend: `NODE_ENV`, `BOOTSTRAP_ADMIN_LOGIN`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `AUTH_SESSION_HOURS`.
- Frontend: `VITE_DEV_AUTO_LOGIN`, `VITE_DEV_LOGIN`, `VITE_DEV_PASSWORD`, além de variáveis opcionais usadas pelo código como `VITE_API_URL`.

## Scripts conferidos

Raiz (`package.json`):

```json
{
  "start": "node backend/server.js",
  "backend": "node backend/server.js",
  "frontend": "npm --prefix frontend run dev",
  "build:frontend": "npm --prefix frontend run build"
}
```

Frontend (`frontend/package.json`):

```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "start": "vite"
}
```

Não existe `backend/package.json`; o backend usa o `package.json` da raiz.

## Documentação

- [Governança](docs/governance/README.md)
- [Requisitos base](docs/governance/requisitos-base.md)
- [Matriz de permissões](docs/governance/matriz-permissoes.md)
- [Smoke tests manuais](docs/governance/smoke-tests.md)
- [Testes e validações](tests/README.md)
- [Ambiente local](docs/setup/ambiente-local.md)
- [Versoes de ambiente](docs/setup/versoes-ambiente.md)
- [Auditoria de cliente HTTP frontend](docs/frontend/http-client-audit.md)
- [Plano de separacao do Api.js frontend](docs/frontend/api-service-split-plan.md)
- [Fronteira do Api.js frontend](docs/frontend/api-boundary.md)
- [UML PlantUML/SVG](docs/uml/README.md)
- [Referências visuais de arquitetura](docs/architecture/referencias-visuais/README.md)
- [Auditoria dos READMEs](docs/governance/readme-audit.md)

## Roadmap próximo

- Remover dependência de `localStorage` para access token em produção no Bloco 4.
- Endurecer CORS, cookies, CSP e variáveis de ambiente para deploy.
- Congelar matriz de permissões antes da migração.
- Revisar auditoria B1/B2/B3 e escopo por Rede/Unidade.
- Documentar smoke tests manuais repetíveis.
- Fazer schema-freeze antes das migrations.
- Planejar migração SQLite -> PostgreSQL.
- Tratar Electron apenas como etapa opcional posterior.

## Troubleshooting

Se o frontend não acessar a API, confirme se o backend está em `http://localhost:3001` e se `VITE_API_URL` não aponta para outro endereço.

Se `/test-db` falhar, rode o backend pela raiz com `npm start` e verifique se o SQLite local pode ser aberto pelo processo Node.

Se o Vite abrir em porta diferente de `5173`, confira a porta exibida no terminal e ajuste `VITE_API_URL` apenas se necessário.

Se o bootstrap local criar credenciais padrão, trate-as apenas como dados de desenvolvimento e defina variáveis próprias para ambientes controlados.
