const express = require('express');
const router = express.Router();
const path = require('path');
const { runQuery, runGet, runExecute } = require('../dbHelper');
const { requireScope } = require('../helpers/scope');
const { requirePermission } = require('../middlewares/requirePermission');
const { PERMISSIONS } = require('../constants/userRoles');
const { receberImagem, validarImagem, gravarImagem, removerArquivo } = require('../helpers/uploadImagem');

const uploadDir = path.join(__dirname, '../uploads/produtos');

const gerenciarProdutos = requirePermission(PERMISSIONS.PRODUTOS_GERENCIAR);

// Valida o escopo antes de ler o multipart.
function exigirEscopo(req, _res, next) {
  try {
    requireScope(req);
    next();
  } catch (error) {
    next(error);
  }
}

function parseProdutoPayload(body = {}) {
  return {
    nome: String(body.nome || '').trim(),
    descricao: body.descricao ? String(body.descricao).trim() : null,
    preco: Number(body.preco),
    estoque: Number(body.estoque),
  };
}

function validarProduto(payload) {
  if (!payload.nome) return 'nome é obrigatório';
  if (!Number.isFinite(payload.preco) || payload.preco <= 0) return 'preco inválido';
  if (!Number.isInteger(payload.estoque) || payload.estoque < 0) return 'estoque inválido';
  return null;
}

router.get('/', async (req, res) => {
  try {
    const scope = requireScope(req);
    const { q, estoque_baixo, sem_estoque } = req.query;
    const filtros = ['tenant_id = ?', 'unit_id = ?'];
    const params = [scope.tenant_id, scope.unit_id];

    if (q) {
      filtros.push(`(LOWER(nome) LIKE ? OR LOWER(COALESCE(descricao, '')) LIKE ?)`);
      params.push(`%${String(q).trim().toLowerCase()}%`, `%${String(q).trim().toLowerCase()}%`);
    }

    if (sem_estoque === '1') {
      filtros.push('estoque = 0');
    } else if (estoque_baixo === '1') {
      filtros.push('estoque > 0 AND estoque <= 5');
    }

    const where = `WHERE ${filtros.join(' AND ')}`;
    const rows = await runQuery(`
      SELECT *,
             CASE
               WHEN estoque = 0 THEN 'sem_estoque'
               WHEN estoque <= 5 THEN 'estoque_baixo'
               ELSE 'ok'
             END AS status_estoque
      FROM produto
      ${where}
      ORDER BY nome ASC
    `, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const scope = requireScope(req);
    const row = await runGet('SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
    if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', gerenciarProdutos, exigirEscopo, receberImagem('imagem'), async (req, res, next) => {
  const payload = parseProdutoPayload(req.body);
  const erro = validarProduto(payload);
  if (erro) return res.status(400).json({ error: erro });

  let arquivo = null;
  try {
    const scope = requireScope(req);
    const tipoImagem = validarImagem(req.file);

    const existente = await runGet(
      'SELECT id FROM produto WHERE LOWER(nome) = LOWER(?) AND tenant_id = ? AND unit_id = ? LIMIT 1',
      [payload.nome, scope.tenant_id, scope.unit_id]
    );
    if (existente) return res.status(409).json({ error: 'Já existe um produto com esse nome' });

    // A imagem so e gravada depois de todas as validacoes.
    arquivo = tipoImagem ? await gravarImagem(req.file, tipoImagem, uploadDir, '/uploads/produtos') : null;

    const result = await runExecute(
      'INSERT INTO produto (nome, descricao, preco, estoque, imagem, tenant_id, unit_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [payload.nome, payload.descricao, payload.preco, payload.estoque, arquivo ? arquivo.url : null, scope.tenant_id, scope.unit_id]
    );

    const criado = await runGet('SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [result.lastID, scope.tenant_id, scope.unit_id]);
    return res.status(201).json(criado);
  } catch (error) {
    await removerArquivo(arquivo?.caminho);
    return next(error);
  }
});

router.put('/:id', gerenciarProdutos, exigirEscopo, receberImagem('imagem'), async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const payload = parseProdutoPayload(req.body);
  const erro = validarProduto(payload);
  if (erro) return res.status(400).json({ error: erro });

  let arquivo = null;
  try {
    const scope = requireScope(req);
    const tipoImagem = validarImagem(req.file);
    const atual = await runGet('SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
    if (!atual) return res.status(404).json({ error: 'Produto não encontrado' });

    arquivo = tipoImagem ? await gravarImagem(req.file, tipoImagem, uploadDir, '/uploads/produtos') : null;
    const imagem = arquivo ? arquivo.url : atual.imagem;

    await runExecute(
      'UPDATE produto SET nome = ?, descricao = ?, preco = ?, estoque = ?, imagem = ? WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [payload.nome, payload.descricao, payload.preco, payload.estoque, imagem, id, scope.tenant_id, scope.unit_id]
    );

    const atualizado = await runGet('SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
    return res.json(atualizado);
  } catch (error) {
    await removerArquivo(arquivo?.caminho);
    return next(error);
  }
});

router.patch('/:id/estoque', gerenciarProdutos, async (req, res) => {
  const id = parseInt(req.params.id);
  const estoque = Number(req.body?.estoque);

  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!Number.isInteger(estoque) || estoque < 0) return res.status(400).json({ error: 'estoque inválido' });

  try {
    const scope = requireScope(req);
    const result = await runExecute(
      'UPDATE produto SET estoque = ? WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [estoque, id, scope.tenant_id, scope.unit_id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Produto não encontrado' });

    const atualizado = await runGet('SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
    res.json(atualizado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', gerenciarProdutos, async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const scope = requireScope(req);
    const venda = await runGet(
      'SELECT id FROM venda_produto WHERE produto_id = ? AND tenant_id = ? AND unit_id = ? LIMIT 1',
      [id, scope.tenant_id, scope.unit_id]
    );
    if (venda) {
      return res.status(400).json({ error: 'Não é possível excluir produto com vendas registradas' });
    }

    const result = await runExecute(
      'DELETE FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [id, scope.tenant_id, scope.unit_id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Produto não encontrado para deletar' });
    res.json({ message: 'Produto deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
