const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runQuery, runGet, runExecute } = require('../dbHelper');

const uploadDir = path.join(__dirname, '../uploads/produtos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

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
    const { q, estoque_baixo, sem_estoque } = req.query;
    const filtros = [];
    const params = [];

    if (q) {
      filtros.push(`(LOWER(nome) LIKE ? OR LOWER(COALESCE(descricao, '')) LIKE ?)`);
      params.push(`%${String(q).trim().toLowerCase()}%`, `%${String(q).trim().toLowerCase()}%`);
    }

    if (sem_estoque === '1') {
      filtros.push('estoque = 0');
    } else if (estoque_baixo === '1') {
      filtros.push('estoque > 0 AND estoque <= 5');
    }

    const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
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
    const row = await runGet('SELECT * FROM produto WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', upload.single('imagem'), async (req, res) => {
  const payload = parseProdutoPayload(req.body);
  const erro = validarProduto(payload);
  if (erro) return res.status(400).json({ error: erro });

  const imagem = req.file ? `/uploads/produtos/${req.file.filename}` : null;

  try {
    const existente = await runGet('SELECT id FROM produto WHERE LOWER(nome) = LOWER(?) LIMIT 1', [payload.nome]);
    if (existente) return res.status(409).json({ error: 'Já existe um produto com esse nome' });

    const result = await runExecute(
      'INSERT INTO produto (nome, descricao, preco, estoque, imagem) VALUES (?, ?, ?, ?, ?)',
      [payload.nome, payload.descricao, payload.preco, payload.estoque, imagem]
    );

    const criado = await runGet('SELECT * FROM produto WHERE id = ?', [result.lastID]);
    res.status(201).json(criado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', upload.single('imagem'), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const payload = parseProdutoPayload(req.body);
  const erro = validarProduto(payload);
  if (erro) return res.status(400).json({ error: erro });

  try {
    const atual = await runGet('SELECT * FROM produto WHERE id = ?', [id]);
    if (!atual) return res.status(404).json({ error: 'Produto não encontrado' });

    let imagem = atual.imagem;
    if (req.file) {
      imagem = `/uploads/produtos/${req.file.filename}`;
    }

    await runExecute(
      'UPDATE produto SET nome = ?, descricao = ?, preco = ?, estoque = ?, imagem = ? WHERE id = ?',
      [payload.nome, payload.descricao, payload.preco, payload.estoque, imagem, id]
    );

    const atualizado = await runGet('SELECT * FROM produto WHERE id = ?', [id]);
    res.json(atualizado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id/estoque', async (req, res) => {
  const id = parseInt(req.params.id);
  const estoque = Number(req.body?.estoque);

  if (!id) return res.status(400).json({ error: 'ID inválido' });
  if (!Number.isInteger(estoque) || estoque < 0) return res.status(400).json({ error: 'estoque inválido' });

  try {
    const result = await runExecute('UPDATE produto SET estoque = ? WHERE id = ?', [estoque, id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Produto não encontrado' });

    const atualizado = await runGet('SELECT * FROM produto WHERE id = ?', [id]);
    res.json(atualizado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const venda = await runGet('SELECT id FROM venda_produto WHERE produto_id = ? LIMIT 1', [id]);
    if (venda) {
      return res.status(400).json({ error: 'Não é possível excluir produto com vendas registradas' });
    }

    const result = await runExecute('DELETE FROM produto WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Produto não encontrado para deletar' });
    res.json({ message: 'Produto deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
