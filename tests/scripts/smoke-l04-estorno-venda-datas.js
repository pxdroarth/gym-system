// Smoke L04 · Estorno de venda: periodos, data operacional e rollback.
//
// Roda em processo, contra o SQLite da copia DESCARTAVEL semeada
// (`npm run db:seed:dev`), chamando o servico real. Injeta o instante somente
// no relogio de negocio deste processo (utils/dataLocal), como o
// smoke-l02-ciclos. Usa os anos de 2030 e 2031 e grava fechamentos e datas de
// venda direto na base, por isso use apenas copia descartavel.
//
// Cobre: mes da venda fechado, mes do estorno fechado, mes do lancamento
// original fechado (venda antiga gravada em UTC), nova tentativa apos
// reabertura com a mesma aprovacao, virada do dia e do mes em Brasilia (a data
// em UTC antecipa o dia), rollback completo quando a gravacao falha no meio,
// venda sem receita original ativa no escopo (exige conciliacao) e a data da
// autorizacao externa (calendario e janela por minuto entre venda e registro;
// em venda legada so com data, limite inferior pela data civil da venda).
//
// Uso:
//   node tests/scripts/smoke-l04-estorno-venda-datas.js
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const datas = require('../../backend/utils/dataLocal');

let agora = new Date();
const dataLocalISO = datas.dataLocalISO;
mock.method(datas, 'dataLocalISO', (ref) => dataLocalISO(ref === undefined ? agora : ref, 'America/Sao_Paulo'));

const db = require('../../backend/database');
const { runGet, runQuery, runExecute, fecharConexaoTransacional } = require('../../backend/dbHelper');
const AuditService = require('../../backend/services/AuditService');
const VendaService = require('../../backend/services/VendaService');
const Estorno = require('../../backend/services/EstornoVendaService');

let total = 0;
let falhas = 0;
function check(label, cond, extra = '') {
  total += 1;
  if (!cond) falhas += 1;
  console.log(`${cond ? '[OK]     ' : '[FALHOU] '}${label}${extra !== '' ? ` - ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
}

async function espera(promessa) {
  try { return { ok: true, valor: await promessa }; } catch (error) { return { ok: false, error }; }
}

async function main() {
  const scope = await runGet(`
    SELECT u.id AS unit_id, u.tenant_id
    FROM unit u JOIN tenant t ON t.id = u.tenant_id
    WHERE t.documento = 'bootstrap-local' AND u.codigo = 'matriz'`);
  assert.ok(scope, 'Matriz sintetica ausente: rode o seed na copia descartavel');
  const ator = (id, role) => ({ id: `smoke-l04e-${id}`, name: `Smoke ${id}`, role, tenant_id: scope.tenant_id, unit_id: scope.unit_id });
  const gestor = ator('gestor', 'gestor');
  const vendedor = ator('recepcao', 'recepcao');

  const prod = await runExecute(
    'INSERT INTO produto (nome, preco, estoque, tenant_id, unit_id) VALUES (?, 10, 100, ?, ?)',
    [`L04E datas ${Date.now()}`, scope.tenant_id, scope.unit_id]
  );
  const produtoId = prod.lastID;
  const estoque = async () => (await runGet('SELECT estoque FROM produto WHERE id = ?', [produtoId])).estoque;
  const item = (q) => [{ produto_id: produtoId, quantidade_reposta: q }];

  async function fechar(ano, mes) {
    await runExecute(
      `INSERT INTO fechamento_mensal (ano, mes, status, fechado_em, tenant_id, unit_id)
       VALUES (?, ?, 'fechado', datetime('now'), ?, ?)
       ON CONFLICT(tenant_id, unit_id, ano, mes) DO UPDATE SET status = 'fechado', fechado_em = datetime('now')`,
      [ano, mes, scope.tenant_id, scope.unit_id]
    );
  }
  async function reabrir(ano, mes) {
    await runExecute("UPDATE fechamento_mensal SET status = 'reaberto', reaberto_em = datetime('now') WHERE ano = ? AND mes = ? AND tenant_id = ? AND unit_id = ?",
      [ano, mes, scope.tenant_id, scope.unit_id]);
  }

  // Venda criada pelo servico real; depois a data gravada e ajustada para o
  // instante desejado (data_venda em UTC, como o SQLite grava) e, quando
  // pedido, a data do lancamento original.
  async function vendaAprovada(qtd, dataVendaUtc, dataLancamento) {
    agora = new Date();
    const { venda } = await VendaService.registrarVenda({ produto_id: produtoId, quantidade: qtd }, vendedor, scope);
    await runExecute('UPDATE venda_produto SET data_venda = ? WHERE id = ?', [dataVendaUtc, venda.id]);
    if (dataLancamento) {
      await runExecute("UPDATE conta_financeira SET data_lancamento = ? WHERE origem = 'venda_produto' AND origem_id = ?", [dataLancamento, venda.id]);
    }
    // Fluxo padrao: o atendente solicita, o gestor aprova e o atendente executa.
    const { estorno: e } = await Estorno.solicitar(venda.id, { motivo: 'smoke datas' }, vendedor, scope);
    await Estorno.aprovar(e.id, gestor, scope);
    return { venda, estornoId: e.id };
  }

  async function foto(vendaId, estornoId) {
    const [v, e, p, n, r, a] = await Promise.all([
      runGet('SELECT reversao_controlada_id FROM venda_produto WHERE id = ?', [vendaId]),
      runGet('SELECT status, executado_por, quantidade_reposta FROM venda_estorno WHERE id = ?', [estornoId]),
      runGet('SELECT estoque FROM produto WHERE id = ?', [produtoId]),
      runGet("SELECT COUNT(*) AS n FROM conta_financeira WHERE origem = 'reversao_controlada'"),
      runGet('SELECT COUNT(*) AS n FROM reversao_controlada'),
      runGet("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'executar_estorno_venda'"),
    ]);
    return JSON.stringify({ v, e, p, n, r, a });
  }

  async function recusa423(label, vendaId, estornoId, trecho) {
    const antes = await foto(vendaId, estornoId);
    const r = await espera(Estorno.executar(estornoId, { itens: item(1) }, vendedor, scope));
    const depois = await foto(vendaId, estornoId);
    check(`${label} -> 423 PERIODO_FECHADO (${trecho})`, !r.ok && r.error.statusCode === 423 && r.error.code === 'PERIODO_FECHADO'
      && String(r.error.message).includes(trecho), r.ok ? 'executou' : `${r.error.statusCode} ${r.error.code} ${r.error.message}`);
    check(`${label}: nada gravado e aprovacao mantida`, antes === depois && JSON.parse(depois).e.status === 'aprovada', antes === depois ? '' : `${antes} -> ${depois}`);
  }

  // ---------- data operacional da venda ----------
  check('venda 01/10/2030 01:30 UTC tem data operacional 30/09/2030', Estorno.dataOperacionalDaVenda('2030-10-01 01:30:00') === '2030-09-30');
  check('venda 15/10/2030 12:00 UTC tem data operacional 15/10/2030', Estorno.dataOperacionalDaVenda('2030-10-15 12:00:00') === '2030-10-15');
  check('venda legada so com data mantem a data', Estorno.dataOperacionalDaVenda('2030-10-15') === '2030-10-15');

  // ---------- mes da venda fechado ----------
  // Venda as 22h30 de 30/09 em Brasilia (01/10 01:30 UTC), lancamento no mesmo dia local.
  const a = await vendaAprovada(1, '2030-10-01 01:30:00', '2030-09-30');
  agora = new Date('2030-10-10T15:00:00-03:00');
  await fechar(2030, 9);
  await recusa423('mes da venda (09/2030) fechado, estorno em 10/2030 aberto', a.venda.id, a.estornoId, 'mes da venda');
  await reabrir(2030, 9);
  let r = await espera(Estorno.executar(a.estornoId, { itens: item(1) }, vendedor, scope));
  check('apos reabrir 09/2030, a mesma aprovacao executa -> ok', r.ok, r.ok ? '' : `${r.error.code} ${r.error.message}`);
  check('contrapartida datada no dia do estorno (10/10/2030)', r.ok && r.valor.lancamento_inverso.data_lancamento === '2030-10-10', r.ok && r.valor.lancamento_inverso.data_lancamento);

  // ---------- mes do estorno fechado ----------
  const b = await vendaAprovada(1, '2030-10-05 15:00:00');
  agora = new Date('2030-11-03T10:00:00-03:00');
  await fechar(2030, 11);
  await recusa423('mes do estorno (11/2030) fechado, venda em 10/2030 aberta', b.venda.id, b.estornoId, 'mes do estorno');
  await reabrir(2030, 11);
  r = await espera(Estorno.executar(b.estornoId, { itens: item(1) }, vendedor, scope));
  check('apos reabrir 11/2030, a mesma aprovacao executa -> ok', r.ok, r.ok ? '' : `${r.error.code} ${r.error.message}`);

  // ---------- mes da venda pelo fuso: UTC daria o mes errado ----------
  // Venda as 22h de 31/10 em Brasilia (01/11 01:00 UTC). Com 10/2030 fechado, o
  // estorno precisa ser recusado; pela data UTC (novembro) passaria.
  const c = await vendaAprovada(1, '2030-11-01 01:00:00', '2030-10-31');
  agora = new Date('2030-11-20T10:00:00-03:00');
  await fechar(2030, 10);
  await recusa423('venda de 31/10 22h (01/11 UTC) com 10/2030 fechado', c.venda.id, c.estornoId, 'mes da venda');
  await reabrir(2030, 10);

  // ---------- lancamento original gravado em UTC no mes seguinte ----------
  // Venda antiga: data local 31/10, lancamento de receita gravado em 01/11 (UTC).
  const d = await vendaAprovada(1, '2030-11-01 01:10:00', '2030-11-01');
  agora = new Date('2030-12-05T10:00:00-03:00');
  await fechar(2030, 11);
  await recusa423('lancamento original em 11/2030 fechado (venda local em 10/2030 aberta)', d.venda.id, d.estornoId, 'lancamento original');
  await reabrir(2030, 11);

  // ---------- virada do mes na execucao ----------
  // 30/11 23h30 em Brasilia = 01/12 02:30 UTC. Com 12/2030 fechado e 11 aberto,
  // o estorno e de novembro: executa e a contrapartida fica em 30/11.
  const e = await vendaAprovada(2, '2030-11-10 15:00:00');
  agora = new Date('2030-11-30T23:30:00-03:00');
  await fechar(2030, 12);
  const est = await estoque();
  r = await espera(Estorno.executar(e.estornoId, { itens: item(2) }, vendedor, scope));
  check('30/11 23h30 com 12/2030 fechado e 11 aberto -> executa', r.ok, r.ok ? '' : `${r.error.code} ${r.error.message}`);
  check('contrapartida em 30/11/2030 (UTC daria 01/12) e data_operacao igual', r.ok && r.valor.lancamento_inverso.data_lancamento === '2030-11-30'
    && r.valor.estorno.data_operacao === '2030-11-30', r.ok && [r.valor.lancamento_inverso.data_lancamento, r.valor.estorno.data_operacao]);
  check('estoque reposto em 2', (await estoque()) === est + 2);
  await reabrir(2030, 12);
  const f = await vendaAprovada(1, '2030-10-20 15:00:00');
  agora = new Date('2030-11-30T23:30:00-03:00');
  await fechar(2030, 11);
  await recusa423('30/11 23h30 com 11/2030 fechado (UTC diria dezembro)', f.venda.id, f.estornoId, 'mes do estorno');
  await reabrir(2030, 11);

  // ---------- virada do dia ----------
  const g = await vendaAprovada(1, '2031-01-10 15:00:00');
  agora = new Date('2031-01-15T22:00:00-03:00');
  r = await espera(Estorno.executar(g.estornoId, { itens: item(0) }, vendedor, scope));
  check('15/01 22h em Brasilia: contrapartida em 15/01/2031 (UTC daria 16/01)', r.ok && r.valor.lancamento_inverso.data_lancamento === '2031-01-15',
    r.ok ? r.valor.lancamento_inverso.data_lancamento : r.error.message);

  // ---------- rollback ----------
  const h = await vendaAprovada(3, '2031-02-10 15:00:00');
  agora = new Date('2031-02-12T10:00:00-03:00');
  const antes = await foto(h.venda.id, h.estornoId);
  const original = AuditService.logAction;
  const falha = mock.method(AuditService, 'logAction', async (entry, client) => {
    if (entry.action === 'executar_estorno_venda') throw new Error('falha simulada na auditoria');
    return original(entry, client);
  });
  r = await espera(Estorno.executar(h.estornoId, { itens: item(2) }, vendedor, scope));
  falha.mock.restore();
  const depois = await foto(h.venda.id, h.estornoId);
  check('falha na auditoria (ultima gravacao) -> erro propagado', !r.ok && /falha simulada/.test(r.error.message), r.ok ? 'executou' : r.error.message);
  check('rollback: estoque, contrapartida, reversao, venda e aprovacao intactos', antes === depois, antes === depois ? '' : `${antes} -> ${depois}`);
  r = await espera(Estorno.executar(h.estornoId, { itens: item(2) }, vendedor, scope));
  check('depois do rollback, a mesma aprovacao executa -> ok, repoe 2', r.ok && r.valor.quantidade_reposta === 2, r.ok ? '' : r.error.message);

  // ---------- receita original ausente no escopo: exige conciliacao ----------
  const filial = await runGet("SELECT id FROM unit WHERE tenant_id = ? AND codigo = 'filial'", [scope.tenant_id]);
  async function recusaSemReceita(label, vendaId, estornoId) {
    const antes = await foto(vendaId, estornoId);
    const lancAntes = await runGet('SELECT COUNT(*) AS n, ROUND(COALESCE(SUM(valor), 0), 2) AS s FROM conta_financeira WHERE deleted_at IS NULL');
    const res = await espera(Estorno.executar(estornoId, { itens: item(1) }, vendedor, scope));
    const depois = await foto(vendaId, estornoId);
    const lancDepois = await runGet('SELECT COUNT(*) AS n, ROUND(COALESCE(SUM(valor), 0), 2) AS s FROM conta_financeira WHERE deleted_at IS NULL');
    check(`${label} -> 409 VENDA_SEM_RECEITA_ORIGINAL com acao de conciliacao`, !res.ok && res.error.statusCode === 409
      && res.error.code === 'VENDA_SEM_RECEITA_ORIGINAL' && res.error.details?.acao_necessaria === 'conciliacao' && /Concilie/.test(res.error.message),
    res.ok ? 'executou' : `${res.error.statusCode} ${res.error.code}`);
    check(`${label}: aprovacao, venda e estoque preservados`, antes === depois && JSON.parse(depois).e.status === 'aprovada'
      && JSON.parse(depois).v.reversao_controlada_id === null, antes === depois ? '' : `${antes} -> ${depois}`);
    check(`${label}: nenhum lancamento novo nem alterado (sem contrapartida)`, JSON.stringify(lancAntes) === JSON.stringify(lancDepois)
      && (await runGet("SELECT COUNT(*) AS n FROM reversao_controlada WHERE registro_origem_id = ? AND tipo = 'venda_produto'", [String(vendaId)])).n === 0,
    [lancAntes, lancDepois]);
    check(`${label}: nenhum evento de execucao na auditoria`, (await runGet(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'executar_estorno_venda' AND record_id = ?", [String(estornoId)])).n === 0);
  }
  const i = await vendaAprovada(2, '2031-03-10 15:00:00', '2031-03-10');
  await runExecute("UPDATE conta_financeira SET deleted_at = datetime('now') WHERE origem = 'venda_produto' AND origem_id = ?", [i.venda.id]);
  const j = await vendaAprovada(1, '2031-03-10 16:00:00', '2031-03-10');
  await runExecute("UPDATE conta_financeira SET unit_id = ? WHERE origem = 'venda_produto' AND origem_id = ?", [filial.id, j.venda.id]);
  agora = new Date('2031-03-12T10:00:00-03:00');
  await recusaSemReceita('receita original excluida', i.venda.id, i.estornoId);
  await recusaSemReceita('receita original so em outra unidade', j.venda.id, j.estornoId);
  await runExecute('UPDATE conta_financeira SET deleted_at = NULL WHERE origem = ? AND origem_id = ?', ['venda_produto', i.venda.id]);
  r = await espera(Estorno.executar(i.estornoId, { itens: item(2) }, vendedor, scope));
  check('apos a conciliacao (receita restaurada), a mesma aprovacao executa -> ok', r.ok && Number(r.valor.lancamento_inverso.valor) === 20,
    r.ok ? '' : `${r.error.code} ${r.error.message}`);

  // ---------- autorizacao externa: calendario e janela por minuto ----------
  // Regra: a data e hora (horas e minutos, fuso da unidade) precisa ser uma
  // data de calendario valida e cair entre o minuto da venda e o minuto do
  // registro, inclusive; os segundos sao descartados nos tres instantes.
  const janela = (aut, venda, registro) => {
    // venda 'AAAA-MM-DD' segue como texto (legada sem hora); com hora vira instante
    const limite = /^\d{4}-\d{2}-\d{2}$/.test(venda) ? venda : new Date(venda);
    try { Estorno.conferirJanelaDaAutorizacao(new Date(aut), limite, new Date(registro)); return 'ok'; } catch (err) { return err.details?.motivo || err.code; }
  };
  const vendaT = '2031-03-10T13:42:35Z';
  const registroT = '2031-03-10T13:50:10Z';
  check('janela: venda 10:42:35 aceita autorizacao informada 10:42 (mesmo minuto)', janela('2031-03-10T13:42:00Z', vendaT, registroT) === 'ok');
  check('janela: 10:41 e anterior a venda', janela('2031-03-10T13:41:00Z', vendaT, registroT) === 'anterior_a_venda');
  check('janela: registro 10:50:10 aceita 10:50 (mesmo minuto)', janela('2031-03-10T13:50:00Z', vendaT, registroT) === 'ok');
  check('janela: 10:51 e posterior ao registro', janela('2031-03-10T13:51:00Z', vendaT, registroT) === 'futura');
  check('janela: segundos informados por API sao descartados (10:50:59 aceito com registro 10:50:10)', janela('2031-03-10T13:50:59Z', vendaT, registroT) === 'ok');
  // Venda legada so com data: limite inferior e 00:00 da data civil no fuso da operacao.
  check('janela legada: 09/03 23:59 e anterior a venda de 10/03', janela('2031-03-10T02:59:00Z', '2031-03-10', registroT) === 'anterior_a_venda');
  check('janela legada: 10/03 00:00 (mesmo dia) aceita', janela('2031-03-10T03:00:00Z', '2031-03-10', registroT) === 'ok');
  check('janela legada: limite superior segue o minuto do registro (10:51 recusada)', janela('2031-03-10T13:51:00Z', '2031-03-10', registroT) === 'futura');

  const fuso = datas.fusoDaOperacao();
  const parede = (instante) => {
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(instante);
    const v = (tipo) => partes.find((x) => x.type === tipo).value;
    return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
  };
  const gestorConta = await runGet("SELECT id FROM usuario_interno WHERE login = 'gestor'");
  const recepcaoConta = await runGet("SELECT id FROM usuario_interno WHERE login = 'recepcao'");
  const registrante = { id: String(recepcaoConta.id), name: 'Recepcao (smoke)', role: 'recepcao', tenant_id: scope.tenant_id, unit_id: scope.unit_id };
  const MIN = 60000;
  // Venda real ha 3 horas, no segundo 59 do minuto; pedido aberto agora.
  const instanteVenda = new Date(Math.floor((Date.now() - 3 * 3600 * 1000) / MIN) * MIN + 59000);
  agora = new Date();
  const { venda: vk } = await VendaService.registrarVenda({ produto_id: produtoId, quantidade: 1 }, vendedor, scope);
  await runExecute('UPDATE venda_produto SET data_venda = ? WHERE id = ?', [instanteVenda.toISOString().slice(0, 19).replace('T', ' '), vk.id]);
  const { estorno: ek } = await Estorno.solicitar(vk.id, { motivo: 'autorizacao anterior ao pedido' }, vendedor, scope);
  const registrar = (quando) => espera(Estorno.registrarAutorizacaoExterna(ek.id, {
    autorizador_id: gestorConta.id, canal: 'whatsapp', referencia: 'Grupo Equipe, smoke', autorizado_em: quando,
  }, registrante, scope));
  async function dataRecusada(label, quando, motivo) {
    const res = await registrar(quando);
    const estado = await runGet('SELECT status, aprovado_por FROM venda_estorno WHERE id = ?', [ek.id]);
    check(`autorizacao ${label} (${quando}) -> 400 DATA_AUTORIZACAO_INVALIDA${motivo ? ` (${motivo})` : ''}`, !res.ok && res.error.statusCode === 400
      && res.error.code === 'DATA_AUTORIZACAO_INVALIDA' && (!motivo || res.error.details?.motivo === motivo),
    res.ok ? 'aceita' : `${res.error.code} ${res.error.details?.motivo || ''}`);
    check(`autorizacao ${label}: pedido continua solicitado`, estado.status === 'solicitada' && estado.aprovado_por === null);
  }
  await dataRecusada('com data inexistente', '2026-02-30T10:00');
  await dataRecusada('com hora inexistente', '2026-11-12T24:00');
  await dataRecusada('ISO com data inexistente', '2026-02-30T10:00:00Z');
  await dataRecusada('fora do formato', '12/11/2026 10:00');
  await dataRecusada('um minuto antes da venda', parede(new Date(instanteVenda.getTime() - MIN)), 'anterior_a_venda');
  await dataRecusada('dois minutos no futuro', parede(new Date(Date.now() + 2 * MIN)), 'futura');
  const informado = parede(instanteVenda);
  r = await registrar(informado);
  const ekDepois = await runGet('SELECT status, aprovado_em, solicitado_em FROM venda_estorno WHERE id = ?', [ek.id]);
  const minutoVenda = new Date(Math.floor(instanteVenda.getTime() / MIN) * MIN).toISOString();
  check(`autorizacao no minuto da venda (${informado}, venda no segundo 59) e anterior ao pedido -> aceita`, r.ok && ekDepois.status === 'aprovada',
    r.ok ? '' : `${r.error.code} ${r.error.details?.motivo || ''}`);
  check('aprovado_em gravado no minuto informado, antes da abertura do pedido', ekDepois.aprovado_em === minutoVenda
    && new Date(ekDepois.aprovado_em) < new Date(ekDepois.solicitado_em), ekDepois);
  const audReg = await runGet("SELECT metadata_json FROM audit_log WHERE action = 'registrar_autorizacao_externa_estorno_venda' AND record_id = ?", [String(ek.id)]);
  const metaReg = JSON.parse(audReg?.metadata_json || '{}');
  check('auditoria guarda o horario informado e a comparacao por minuto', metaReg.autorizador?.em_informado === informado
    && metaReg.autorizador?.comparacao === 'minuto' && metaReg.declarada_pelo_operador === true, metaReg.autorizador);

  // ---------- venda legada sem hora: limite inferior pela data civil ----------
  // data_venda so com 'AAAA-MM-DD' (legado): vale autorizacao a partir das 00:00
  // da data da venda, no fuso da operacao; a venda nao recebe horario.
  const DIA = 24 * 3600 * 1000;
  const dataCivil = (instante) => parede(instante).slice(0, 10);
  const deslocarData = (data, dias) => new Date(Date.parse(`${data}T12:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
  const hojeLocal = dataCivil(new Date());
  const ontemLocal = deslocarData(hojeLocal, -1);
  const anteontemLocal = deslocarData(hojeLocal, -2);
  async function pedidoLegado(motivo) {
    agora = new Date();
    const { venda } = await VendaService.registrarVenda({ produto_id: produtoId, quantidade: 1 }, vendedor, scope);
    await runExecute('UPDATE venda_produto SET data_venda = ? WHERE id = ?', [ontemLocal, venda.id]);
    const { estorno } = await Estorno.solicitar(venda.id, { motivo }, vendedor, scope);
    return { venda, estorno };
  }
  const registrarEm = (estornoId, quando) => espera(Estorno.registrarAutorizacaoExterna(estornoId, {
    autorizador_id: gestorConta.id, canal: 'email', referencia: 'E-mail do gestor, smoke legado', autorizado_em: quando,
  }, registrante, scope));
  const l1 = await pedidoLegado('legada: dia anterior e mesmo dia');
  r = await registrarEm(l1.estorno.id, `${anteontemLocal}T23:59`);
  let estL = await runGet('SELECT status FROM venda_estorno WHERE id = ?', [l1.estorno.id]);
  check(`legada de ${ontemLocal}: autorizacao no dia anterior (${anteontemLocal} 23:59) -> 400 anterior_a_venda pela data`, !r.ok
    && r.error.code === 'DATA_AUTORIZACAO_INVALIDA' && r.error.details?.motivo === 'anterior_a_venda'
    && r.error.details?.limite_inferior === 'data_da_venda' && estL.status === 'solicitada', r.ok ? 'aceita' : `${r.error.code} ${JSON.stringify(r.error.details)}`);
  r = await registrarEm(l1.estorno.id, `${ontemLocal}T00:00`);
  estL = await runGet('SELECT status, aprovado_em FROM venda_estorno WHERE id = ?', [l1.estorno.id]);
  check(`legada de ${ontemLocal}: autorizacao no mesmo dia as 00:00 -> aceita`, r.ok && estL.status === 'aprovada', r.ok ? '' : `${r.error.code} ${JSON.stringify(r.error.details)}`);
  const audL = JSON.parse((await runGet("SELECT metadata_json FROM audit_log WHERE action = 'registrar_autorizacao_externa_estorno_venda' AND record_id = ?", [String(l1.estorno.id)]))?.metadata_json || '{}');
  check('auditoria indica o limite inferior pela data da venda', audL.autorizador?.limite_inferior === 'data_da_venda', audL.autorizador);
  check('a venda legada continua sem horario no historico', (await runGet('SELECT data_venda FROM venda_produto WHERE id = ?', [l1.venda.id])).data_venda === ontemLocal);
  const l2 = await pedidoLegado('legada: dia seguinte');
  r = await registrarEm(l2.estorno.id, `${hojeLocal}T00:00`);
  check(`legada de ${ontemLocal}: autorizacao no dia seguinte (${hojeLocal} 00:00), antes do registro -> aceita`, r.ok
    && (await runGet('SELECT status FROM venda_estorno WHERE id = ?', [l2.estorno.id])).status === 'aprovada', r.ok ? '' : `${r.error.code} ${JSON.stringify(r.error.details)}`);
  const l3 = await pedidoLegado('legada: depois do registro');
  r = await registrarEm(l3.estorno.id, parede(new Date(Date.now() + 2 * MIN)));
  check('legada: autorizacao depois do minuto do registro -> 400 futura', !r.ok && r.error.details?.motivo === 'futura'
    && (await runGet('SELECT status FROM venda_estorno WHERE id = ?', [l3.estorno.id])).status === 'solicitada', r.ok ? 'aceita' : r.error.details);

  console.log(`\n[smoke-l04-estorno-venda-datas] ${total - falhas}/${total} verificacoes OK`);
}

main()
  .catch((error) => {
    console.error('[ERRO]', error);
    falhas += 1;
  })
  .finally(async () => {
    await fecharConexaoTransacional();
    db.close(() => process.exit(falhas ? 1 : 0));
  });
