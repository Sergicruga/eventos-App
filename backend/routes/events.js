const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
router.get('/_ping', (_req, res) => res.json({ ok: true }));
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM events WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Evento no encontrado' });
    return res.status(204).send();
  } catch (e) {
    console.error('DELETE /api/events/:id failed', e);
    return res.status(500).json({ error: 'Error eliminando el evento' });
  }
});

module.exports = router;
