const express = require('express');
const router = express.Router();

// Rota placeholder para evitar erro
router.get('/', (req, res) => {
  res.json({ mensagem: "Rota de relatórios - em desenvolvimento" });
});

module.exports = router;
