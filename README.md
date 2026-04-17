# Sistema de Gestão de Academia

Sistema web de gestão de academia com foco operacional, regras de negócio formalizadas e base preparada para futura evolução para SaaS.

Atualmente o projeto está organizado em duas frentes principais:
- **Backend** em Node.js + Express com SQLite
- **Frontend** em React + Vite

O projeto está em fase ativa de evolução funcional, com foco em consistência operacional, rastreabilidade, controle de acesso, mensalidades, financeiro e padronização da API.

## Estado atual do projeto

- Aplicação em uso no modo **web** durante a fase atual de desenvolvimento
- Backend funcional com rotas modulares
- Frontend funcional em React + Vite
- Banco de dados SQLite em operação local
- Regras de negócio centrais já definidas para acesso, mensalidades, vínculos, auditoria e fechamento mensal

## Stack real do projeto

### Backend / API
Dependências confirmadas no `package.json` da raiz:

- **Node.js**
- **Express** `^5.1.0`
- **SQLite3** `^5.1.7`
- **CORS** `^2.8.5`
- **Multer** `^2.0.0`
- **Node-Cron** `^4.0.7`
- **MySQL2** `^3.14.1` *(dependência presente no projeto, mesmo com SQLite sendo o banco principal da fase atual)*

### Frontend
Dependências confirmadas em `frontend/package.json`:

- **React** `^18.2.0`
- **React DOM** `^18.2.0`
- **Vite** `^5.2.0`
- **Axios** `^1.10.0`
- **React Router DOM** `^6.30.1`
- **React Hook Form** `^7.56.4`
- **React Toastify** `^11.0.5`
- **Tailwind CSS** `^3.4.17`
- **Styled Components** `^6.1.18`
- **Lucide React** `^0.522.0`
- **Recharts** `^3.0.2`
- **ApexCharts** `^4.7.0`
- **React ApexCharts** `^1.7.0`
- **Nivo** (`@nivo/bar`, `@nivo/core`, `@nivo/line`, `@nivo/pie`) `^0.99.0`
- **Vite Plugin PWA** `^1.0.2`

## Estrutura do projeto

```bash
sistema-academia-main/
├── backend/
│   ├── routes/
│   ├── services/
│   ├── seeds/
│   ├── database.js
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.*
├── diagramas/
│   ├── Diagrama de contexto do backend.png
│   ├── Diagrama de evolução de persistência.png
│   ├── Diagrama de módulos do backend.png
│   ├── Fluxo de decisão de acesso.png
│   ├── Máquina de estados de acesso.png
│   ├── Máquina de estados de mensalidade.png
│   └── notasextras.txt
├── academia.sqlite
├── package.json
└── README.md
```

> Observação: no estado atual do projeto, o backend utiliza o `package.json` da raiz. Não há um `backend/package.json` separado no zip enviado.

## Módulos principais

- Gestão de alunos
- Planos e planos compartilhados
- Vínculo dependente-responsável
- Mensalidades
- Pagamentos
- Controle de acessos
- Produtos
- Vendas de produtos
- Financeiro
- Dashboard financeiro
- Relatórios
- Auditoria e rastreabilidade

## Regras de negócio consolidadas

### 1. Estados de mensalidade
- `em_aberto`
- `parcial`
- `pago`
- `vencido`
- `cancelado`
- `em_reversao_controlada`
- `bloqueada_por_fechamento`

### 2. Estados de acesso
- `liberado`
- `liberado_com_restricao`
- `liberado_manual`
- `bloqueado_inadimplencia`
- `bloqueado_inativo`
- `bloqueado_pendente_regularizacao`

### 3. Estados de vínculo
- `ativo`
- `pendente_regularizacao`
- `encerrado`

### 4. Fechamento mensal
- `aberto`
- `fechado`
- `reaberto`
- `fechado_com_inconsistencias`

### 5. Regras de acesso
- Aluno com mensalidade **em aberto**, mas ainda dentro do prazo de vencimento, pode acessar.
- Aluno com mensalidade **parcial** pode acessar com aviso visual e restrição operacional.
- Aluno com mensalidade **vencida** não libera catraca.
- Aluno **inativo** não libera catraca.
- Dependentes seguem a situação do responsável.
- Se o responsável estiver inadimplente, todos os dependentes ficam bloqueados.
- Deve existir **liberação manual** de acesso para exceções operacionais, sempre com motivo e log obrigatório.

### 6. Regras de planos compartilhados
- Existe sempre um **responsável principal**.
- Os dependentes herdam a situação de acesso do responsável.
- O vínculo é sempre do tipo **dependente-responsável**.
- Não há modelo de grupo flexível na fase atual.
- Se o responsável mudar de plano, os dependentes ficam em **pendente_regularizacao** até o reenvinculamento ou regularização da nova configuração.

### 7. Regras de mensalidades
- A geração deve ser **idempotente**.
- O sistema não deve gerar mensalidade duplicada para o mesmo aluno e mesmo período.
- A base de cobrança nasce da configuração do plano, com possibilidade de ajuste manual controlado.
- O valor cobrado é um **snapshot** da operação.
- O valor atual do plano não altera histórico antigo.
- Desconto aplicado deve ser persistido.
- Forma de pagamento deve ser registrada.

### 8. Regras financeiras
- O sistema trabalha prioritariamente com **regime de caixa**.
- Mensalidade paga deve refletir na receita.
- Venda concluída deve refletir na receita.
- Despesa paga deve impactar o caixa.
- Em caso de correção, a abordagem é de **reversão controlada**, com lançamento inverso e log obrigatório.

### 9. Auditoria e rastreabilidade
- Toda ação crítica deve registrar:
  - quem fez
  - quando fez
  - o que mudou
  - antes e depois
- Cada funcionário deve possuir histórico próprio de ações.
- O dono ou administrador principal deve ter acesso total ao histórico.
- Logs não devem ser apagados por operação comum.

### 10. Consistência entre módulos
- Pagamento sem mensalidade deve ser proibido.
- Venda sem produto deve ser impossível.
- Dependente sem responsável válido deve ser proibido.
- Exclusão física deve ser evitada; a regra principal é **soft delete** ou inativação lógica.

## Funcionalidades em destaque

### Alunos
- Cadastro e edição
- Perfil detalhado
- Status operacional
- Histórico de mensalidades
- Histórico de acessos

### Planos
- Planos individuais
- Planos compartilhados
- Controle de capacidade por vínculo
- Regras de regularização

### Mensalidades e pagamentos
- Geração manual e automática
- Pagamento total ou parcial
- Controle de vencimento
- Histórico e rastreabilidade

### Acesso
- Liberação por regra financeira
- Bloqueio automático por inadimplência
- Bloqueio por inatividade
- Liberação manual com justificativa

### Produtos e vendas
- Cadastro de produtos
- Controle de estoque
- Registro de vendas
- Integração com financeiro

### Financeiro
- Dashboard com KPIs
- Contas a pagar e receber
- Plano de contas
- Orçamento
- Consolidação financeira
- Fechamento mensal com inconsistências

## Rotas já expostas no backend

Exemplos de rotas registradas no projeto:

- `GET /alunos`
- `GET /planos`
- `GET /mensalidades`
- `GET /produtos`
- `GET /vendasProdutos`
- `GET /financeiro`
- `GET /dashboard/financeiro/kpis`
- `GET /test-db`

## Como executar o projeto

## 1. Instalar dependências do backend/API
Na raiz do projeto:

```bash
npm install
```

## 2. Rodar o backend
Na raiz do projeto:

```bash
npm start
```

ou

```bash
npm run backend
```

A API deve subir em:

```bash
http://localhost:3001
```

## 3. Rodar o frontend
Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

ou

```bash
npm start
```

O frontend deve subir em ambiente local Vite.

## 4. Teste rápido de banco

```bash
curl http://localhost:3001/test-db
```

## Scripts disponíveis

### Raiz
```json
{
  "start": "node backend/server.js",
  "backend": "node backend/server.js",
  "frontend": "npm --prefix frontend run dev",
  "build:frontend": "npm --prefix frontend run build"
}
```

### Frontend
```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "start": "vite"
}
```

## Observações de arquitetura

- A fase atual prioriza consistência operacional e evolução incremental.
- O projeto ainda pode passar por refatorações para service layer mais forte e maior isolamento das regras de negócio.
- A estrutura atual já permite evolução para modelo SaaS no futuro, mediante migração arquitetural apropriada.
- A integração biométrica ainda não foi implementada de forma final e deve ser tratada como etapa futura.

## Próximos focos recomendados

- Formalização de papéis e permissões
- Camada de serviços por domínio
- Contratos de API mais rígidos
- Auditoria persistente por funcionário
- Fechamento mensal com reabertura controlada
- Padronização de respostas e erros

## Autor

Pedro Arthur Maia
