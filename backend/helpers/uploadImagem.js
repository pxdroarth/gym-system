// Upload e publicacao de imagens (S1-P0, FV-05).
//
// - O arquivo chega em memoria (multer.memoryStorage), com limite de tamanho.
//   Nada vai para o disco antes de a requisicao passar por sessao, escopo e
//   validacao; requisicao recusada nao deixa arquivo.
// - O tipo e decidido pelo conteudo (assinatura dos primeiros bytes), nunca
//   pelo nome ou pelo Content-Type enviado pelo cliente. So JPEG, PNG e WebP.
// - O nome gravado e gerado pelo servidor, com a extensao do tipo detectado.
// - A publicacao em /uploads so entrega arquivos cuja extensao E cujo
//   conteudo sejam de imagem permitida, com Content-Type fixo e nosniff.
//   Arquivos ativos que ja estejam na pasta (html, svg, js...) nao sao servidos.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AppError = require('../errors/AppError');

const LIMITE_BYTES = Number(process.env.UPLOAD_IMAGEM_MAX_BYTES) || 2 * 1024 * 1024;

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const TIPOS_IMAGEM = [
  { tipo: 'jpeg', ext: '.jpg', mime: 'image/jpeg', confere: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { tipo: 'png', ext: '.png', mime: 'image/png', confere: (b) => b.length >= 8 && b.subarray(0, 8).equals(ASSINATURA_PNG) },
  { tipo: 'webp', ext: '.webp', mime: 'image/webp', confere: (b) => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
];

// Extensoes publicaveis -> tipo esperado do conteudo.
const EXTENSOES_PUBLICAVEIS = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
};

function tipoPeloConteudo(buffer) {
  return TIPOS_IMAGEM.find((t) => t.confere(buffer)) || null;
}

const multerImagem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_BYTES, files: 1, fields: 20, parts: 25 },
});

// Middleware: recebe no maximo um arquivo no campo `campo`, em memoria.
function receberImagem(campo = 'imagem') {
  const handler = multerImagem.single(campo);
  return (req, res, next) => {
    handler(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(
          `Imagem maior que o limite de ${Math.round(LIMITE_BYTES / 1024)} KB`,
          413,
          'IMAGEM_GRANDE_DEMAIS',
          { limite_bytes: LIMITE_BYTES }
        ));
      }
      if (err instanceof multer.MulterError) {
        return next(new AppError(`Upload invalido: ${err.message}`, 400, 'UPLOAD_INVALIDO', { campo: err.field }));
      }
      return next(err);
    });
  };
}

// Valida o arquivo recebido em memoria. Retorna o tipo detectado ou null se
// nao houve arquivo. Lanca 400 se o conteudo nao for imagem permitida.
function validarImagem(file) {
  if (!file) return null;
  const tipo = tipoPeloConteudo(file.buffer || Buffer.alloc(0));
  if (!tipo) {
    throw new AppError(
      'Arquivo nao e imagem permitida (aceitos: JPEG, PNG, WebP)',
      400,
      'IMAGEM_TIPO_INVALIDO'
    );
  }
  return tipo;
}

// Grava a imagem ja validada com nome gerado pelo servidor.
async function gravarImagem(file, tipo, pastaAbsoluta, prefixoUrl) {
  await fs.promises.mkdir(pastaAbsoluta, { recursive: true });
  const nome = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${tipo.ext}`;
  const caminho = path.join(pastaAbsoluta, nome);
  await fs.promises.writeFile(caminho, file.buffer, { flag: 'wx' });
  return { caminho, url: `${prefixoUrl}/${nome}` };
}

async function removerArquivo(caminho) {
  if (!caminho) return;
  try {
    await fs.promises.unlink(caminho);
  } catch (_) {
    // ja removido ou inexistente
  }
}

// Middleware de publicacao de /uploads: so imagem permitida por extensao e
// conteudo. Qualquer outro arquivo (inclusive legado) responde 404.
function servirUploads(pastaAbsoluta) {
  const raiz = path.resolve(pastaAbsoluta);
  return async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
    let relativo;
    try {
      relativo = decodeURIComponent(req.path);
    } catch (_) {
      return res.status(400).end();
    }
    const caminho = path.resolve(raiz, `.${relativo}`);
    if (!caminho.startsWith(raiz + path.sep)) return res.status(404).end();

    const tipoEsperado = EXTENSOES_PUBLICAVEIS[path.extname(caminho).toLowerCase()];
    if (!tipoEsperado) return res.status(404).end();

    let cabecalho;
    try {
      const fh = await fs.promises.open(caminho, 'r');
      try {
        const buf = Buffer.alloc(12);
        const { bytesRead } = await fh.read(buf, 0, 12, 0);
        cabecalho = buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    } catch (_) {
      return res.status(404).end();
    }
    const tipo = tipoPeloConteudo(cabecalho);
    if (!tipo || tipo.tipo !== tipoEsperado) return res.status(404).end();

    res.setHeader('Content-Type', tipo.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', 'inline');
    return res.sendFile(caminho, { dotfiles: 'deny', headers: { 'Content-Type': tipo.mime } }, (err) => {
      if (err && !res.headersSent) next(err);
    });
  };
}

module.exports = {
  LIMITE_BYTES,
  receberImagem,
  validarImagem,
  gravarImagem,
  removerArquivo,
  servirUploads,
};
