// Diagnostico READ-ONLY de vinculos usuario <-> Rede/Unidade (GS-03).
//
// Uso: node tests/scripts/diagnostico-vinculos.js [caminho/para/academia.sqlite]
//
// Abre o banco em modo somente leitura e lista vinculos ativos que merecem
// revisao humana. Nao altera nada. O tratamento esta descrito em
// docs/governance/vinculos-escopo-legado.md.
const path = require('path');
const sqlite3 = require('sqlite3');

const dbPath = path.resolve(process.argv[2] || path.join(__dirname, '../../backend/academia.sqlite'));
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error(`[diagnostico-vinculos] Nao foi possivel abrir ${dbPath}: ${err.message}`);
    process.exit(1);
  }
});
const all = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))));

async function columnExists(table, column) {
  const cols = await all(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

async function main() {
  const hasOrigem = await columnExists('usuario_unit', 'origem');
  const links = await all(`
    SELECT uu.id AS vinculo_id, uu.usuario_id, us.login, us.papel, us.status AS usuario_status,
           uu.unit_id, un.nome AS unidade, un.tenant_id, t.nome AS rede, uu.is_default,
           ${hasOrigem ? 'uu.origem' : 'NULL AS origem'}, uu.created_at,
           (SELECT ut.status FROM usuario_tenant ut WHERE ut.usuario_id = uu.usuario_id AND ut.tenant_id = un.tenant_id LIMIT 1) AS vinculo_rede
    FROM usuario_unit uu
    JOIN usuario_interno us ON us.id = uu.usuario_id
    JOIN unit un ON un.id = uu.unit_id
    JOIN tenant t ON t.id = un.tenant_id
    WHERE uu.status = 'ativo'
    ORDER BY uu.usuario_id, un.tenant_id, uu.unit_id
  `);

  const byUser = new Map();
  for (const link of links) {
    if (!byUser.has(link.usuario_id)) byUser.set(link.usuario_id, []);
    byUser.get(link.usuario_id).push(link);
  }

  const achados = [];
  for (const [, userLinks] of byUser) {
    const redes = new Set(userLinks.map((l) => l.tenant_id));
    const padroes = userLinks.filter((l) => Number(l.is_default) === 1).length;
    for (const link of userLinks) {
      const motivos = [];
      if (!link.origem) motivos.push('ORIGEM_NAO_CONFIRMADA');
      if (redes.size > 1) motivos.push('USUARIO_EM_MAIS_DE_UMA_REDE');
      if (padroes > 1) motivos.push('MAIS_DE_UMA_UNIDADE_PADRAO');
      if (link.vinculo_rede !== 'ativo') motivos.push('SEM_VINCULO_ATIVO_COM_A_REDE');
      if (!motivos.length) continue;
      const suspeito = !link.origem && (redes.size > 1 || padroes > 1);
      achados.push({
        prioridade: suspeito ? 'ALTA' : (link.vinculo_rede !== 'ativo' ? 'MEDIA' : 'BAIXA'),
        vinculo_id: link.vinculo_id,
        usuario: `${link.login} (${link.usuario_id})`,
        papel: link.papel,
        rede: `${link.rede} (${link.tenant_id})`,
        unidade: `${link.unidade} (${link.unit_id})`,
        padrao: link.is_default,
        origem: link.origem || '-',
        motivos: motivos.join(', '),
      });
    }
  }

  const ativos = await all("SELECT id, login FROM usuario_interno WHERE status = 'ativo'");
  const semUnidade = ativos.filter((u) => !byUser.has(u.id)).map((u) => `${u.login} (${u.id})`);

  const ordem = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
  achados.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
  console.log(`[diagnostico-vinculos] ${dbPath}`);
  console.log(`[diagnostico-vinculos] vinculos ativos: ${links.length}; para revisar: ${achados.length} (ALTA ${achados.filter((a) => a.prioridade === 'ALTA').length})`);
  if (achados.length) console.table(achados);
  if (semUnidade.length) console.log(`[diagnostico-vinculos] usuarios ativos sem nenhuma unidade (nao conseguem entrar): ${semUnidade.join(', ')}`);
  if (!hasOrigem) console.log('[diagnostico-vinculos] base ainda sem coluna usuario_unit.origem: suba a API uma vez com o codigo da GS-03.');
  db.close();
}

main().catch((error) => {
  console.error(`[diagnostico-vinculos] ${error.message}`);
  db.close();
  process.exit(1);
});
