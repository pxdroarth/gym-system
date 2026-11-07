// Smoke GS-07 F0: P2 (fatura futura nao esconde cobertura paga), P9 (data
// local da operacao) e P10 (edicao preserva cobertura e observacoes).
// Roda em processo sobre backend/academia.sqlite. Use base descartavel
// (npm run db:seed:dev). Fixtures com prefixo SMOKE_F0_ sao removidas no fim.
const ensureSchema = require('../../backend/database/ensureSchema');
const db = require('../../backend/database');
const { runGet, runQuery, runExecute } = require('../../backend/dbHelper');
const AccessService = require('../../backend/services/AccessService');
const MensalidadeService = require('../../backend/services/MensalidadeService');

const PREFIX = 'SMOKE_F0_';
let falhas = 0;
let total = 0;
function check(label, cond, extra = '') {
  total += 1;
  if (!cond) falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra ? ` - ${extra}` : ''}`);
}

async function limpar() {
  const alunos = await runQuery('SELECT id FROM aluno WHERE nome LIKE ?', [`${PREFIX}%`]);
  for (const { id } of alunos) {
    await runExecute('DELETE FROM pagamento WHERE mensalidade_id IN (SELECT id FROM mensalidade WHERE aluno_id = ?)', [id]);
    await runExecute('DELETE FROM mensalidade WHERE aluno_id = ?', [id]);
    await runExecute('DELETE FROM acesso WHERE aluno_id = ?', [id]);
    await runExecute('DELETE FROM aluno WHERE id = ?', [id]);
  }
}

async function main() {
  await ensureSchema();
  await limpar();
  const unit = await runGet("SELECT u.id, u.tenant_id FROM unit u JOIN tenant t ON t.id = u.tenant_id WHERE t.documento = 'bootstrap-local' AND u.codigo = 'matriz'");
  const plano = await runGet('SELECT id FROM plano WHERE tenant_id = ? ORDER BY id LIMIT 1', [unit.tenant_id]);
  const scope = { tenant_id: unit.tenant_id, unit_id: unit.id };
  let matricula = 9100;

  async function aluno(nome) {
    matricula += 1;
    const r = await runExecute(
      `INSERT INTO aluno (matricula, nome, status, dia_vencimento, plano_id, telefone, data_nascimento, tenant_id, unit_id)
       VALUES (?, ?, 'ativo', 10, ?, NULL, '1990-01-01', ?, ?)`,
      [matricula, `${PREFIX}${nome}`, plano.id, scope.tenant_id, scope.unit_id]
    );
    return r.lastID;
  }

  async function mensalidade(alunoId, { status, inicio = null, fim = null, venc, obs = '' }) {
    const r = await runExecute(
      `INSERT INTO mensalidade (aluno_id, plano_id, valor_cobrado, desconto_aplicado, status, data_inicio, data_fim, vencimento, observacoes, tenant_id, unit_id)
       VALUES (?, ?, 80, 0, ?, ?, ?, ?, ?, ?, ?)`,
      [alunoId, plano.id, status, inicio, fim, venc, obs, scope.tenant_id, scope.unit_id]
    );
    return r.lastID;
  }

  const avaliar = (id, agora) => AccessService.avaliarAcessoAluno(id, { scope, agora: new Date(agora) });
  const MEIO_DO_MES = '2026-11-15T12:00:00-03:00';

  // ---------- P9: data local ----------
  let dataLocalISO = null;
  try {
    ({ dataLocalISO } = require('../../backend/utils/dataLocal'));
  } catch (_error) {
    dataLocalISO = null;
  }
  check('P9 utilitario de data local existe', Boolean(dataLocalISO));
  if (dataLocalISO) {
    check('P9 22:30 de 09/11 em Brasilia (01:30Z de 10/11) -> 2026-11-09', dataLocalISO(new Date('2026-11-10T01:30:00Z')) === '2026-11-09');
    check('P9 00:30 de 10/11 em Brasilia -> 2026-11-10', dataLocalISO(new Date('2026-11-10T03:30:00Z')) === '2026-11-10');
  }

  const e = await aluno('P9 cobertura ate 09/11');
  await mensalidade(e, { status: 'pago', inicio: '2026-10-10', fim: '2026-11-09', venc: '2026-10-10' });
  let r = await avaliar(e, '2026-11-09T22:30:00-03:00');
  check('P9 cobertura ate 09/11 vale ate o fim do dia local (22:30)', r.resultado === 'permitido', r.motivo || '');
  r = await avaliar(e, '2026-11-10T00:30:00-03:00');
  check('P9 em 10/11 00:30 local a cobertura acabou', r.resultado === 'negado', r.motivo || '');

  const f = await aluno('P9 vencimento hoje');
  await mensalidade(f, { status: 'pago', inicio: '2026-10-15', fim: '2026-11-14', venc: '2026-10-15' });
  await mensalidade(f, { status: 'em_aberto', inicio: '2026-11-15', fim: '2026-12-14', venc: '2026-11-09' });
  r = await avaliar(f, '2026-11-09T22:30:00-03:00');
  check('P9 em aberto com vencimento 09/11 nao esta vencido as 22:30 locais', r.resultado === 'permitido', r.motivo || '');
  r = await avaliar(f, '2026-11-10T00:30:00-03:00');
  check('P9 em 10/11 o mesmo em aberto ja esta vencido (regra atual mantida)', r.resultado === 'negado' && r.motivo === 'mensalidade_vencida', r.motivo || '');

  // ---------- P2: fatura futura ----------
  const a = await aluno('P2 em dia com fatura futura');
  await mensalidade(a, { status: 'pago', inicio: '2026-11-01', fim: '2026-11-30', venc: '2026-11-01' });
  await mensalidade(a, { status: 'em_aberto', inicio: '2026-12-01', fim: '2026-12-30', venc: '2026-12-10' });
  await mensalidade(a, { status: 'em_aberto', inicio: '2027-01-01', fim: '2027-01-30', venc: '2027-01-10' });
  r = await avaliar(a, MEIO_DO_MES);
  check('P2 cobertura paga vigente + faturas futuras em aberto -> permitido', r.resultado === 'permitido', r.motivo || '');

  const b = await aluno('P2 debito vencido');
  await mensalidade(b, { status: 'pago', inicio: '2026-11-01', fim: '2026-11-30', venc: '2026-11-01' });
  await mensalidade(b, { status: 'em_aberto', inicio: '2026-10-01', fim: '2026-10-30', venc: '2026-11-05' });
  r = await avaliar(b, MEIO_DO_MES);
  check('P2 debito vencido continua bloqueando mesmo com cobertura paga', r.resultado === 'negado' && r.motivo === 'mensalidade_vencida', r.motivo || '');

  const c = await aluno('P2 pacote pre-pago');
  await mensalidade(c, { status: 'pago', inicio: '2026-10-01', fim: '2026-12-29', venc: '2026-10-01' });
  await mensalidade(c, { status: 'em_aberto', inicio: '2026-12-30', fim: '2027-03-29', venc: '2026-12-30' });
  r = await avaliar(c, MEIO_DO_MES);
  check('P2 pacote pre-pago de 90 dias vigente + renovacao futura em aberto -> permitido', r.resultado === 'permitido', r.motivo || '');

  const sem = await aluno('P2 so fatura futura');
  await mensalidade(sem, { status: 'em_aberto', inicio: '2026-12-01', fim: '2026-12-30', venc: '2026-12-10' });
  r = await avaliar(sem, MEIO_DO_MES);
  check('P2 sem cobertura hoje, so fatura futura -> negado', r.resultado === 'negado', r.motivo || '');

  const leg = await aluno('P2 legado sem datas');
  await mensalidade(leg, { status: 'pago', venc: '2026-11-20' });
  r = await avaliar(leg, MEIO_DO_MES);
  check('P2 legado sem datas de cobertura mantem regra antiga (pago com vencimento futuro libera)', r.resultado === 'permitido', r.motivo || '');
  const leg2 = await aluno('P2 legado em aberto');
  await mensalidade(leg2, { status: 'em_aberto', venc: '2026-11-20' });
  r = await avaliar(leg2, MEIO_DO_MES);
  check('P2 legado em aberto sem datas continua bloqueando', r.resultado === 'negado', r.motivo || '');

  // ---------- P10: edicao ----------
  const p = await aluno('P10 pacote');
  const mId = await mensalidade(p, { status: 'pago', inicio: '2026-10-01', fim: '2026-12-29', venc: '2026-10-01', obs: 'pacote trimestral promocional' });
  let m = await MensalidadeService.atualizarMensalidade(mId, { valor_cobrado: 75 }, scope);
  check('P10 editar so o valor preserva cobertura de 90 dias', m.data_inicio === '2026-10-01' && m.data_fim === '2026-12-29', `${m.data_inicio}..${m.data_fim}`);
  check('P10 editar so o valor preserva observacoes', m.observacoes === 'pacote trimestral promocional', JSON.stringify(m.observacoes));
  check('P10 o valor foi alterado', Number(m.valor_cobrado) === 75);
  m = await MensalidadeService.atualizarMensalidade(mId, { vencimento: '2026-10-05' }, scope);
  check('P10 editar o vencimento nao recalcula a cobertura', m.vencimento === '2026-10-05' && m.data_inicio === '2026-10-01' && m.data_fim === '2026-12-29', `${m.vencimento} ${m.data_inicio}..${m.data_fim}`);
  m = await MensalidadeService.atualizarMensalidade(mId, { data_fim: '2026-12-31' }, scope);
  check('P10 cobertura muda quando pedida explicitamente', m.data_inicio === '2026-10-01' && m.data_fim === '2026-12-31', `${m.data_inicio}..${m.data_fim}`);
  m = await MensalidadeService.atualizarMensalidade(mId, { observacoes: '' }, scope);
  check('P10 observacoes so sao limpas quando enviadas vazias', m.observacoes === '', JSON.stringify(m.observacoes));
  let erro = null;
  try {
    await MensalidadeService.atualizarMensalidade(mId, { data_inicio: '2027-01-10' }, scope);
  } catch (error) {
    erro = error;
  }
  check('P10 cobertura invertida e recusada (400)', erro && erro.statusCode === 400 && erro.code === 'MENSALIDADE_COBERTURA_INVALIDA', erro ? erro.code : 'sem erro');

  await limpar();
  console.log(`[smoke-f0] ${total - falhas}/${total} verificacoes OK`);
}

main()
  .catch((error) => {
    falhas += 1;
    console.error(`[FALHOU] smoke-f0: ${error.message}`);
  })
  .finally(() => {
    db.close(() => process.exit(falhas ? 1 : 0));
  });
