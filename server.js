const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'carousel.db');

app.use(cors());
app.use(express.json());

// Conexión a la base de datos SQLite
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite en:', DB_PATH);
    initializeDatabase();
  }
});

// Inicialización de la tabla
function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS tbl_costos_produccion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descripcion TEXT NOT NULL,
      tipo_registro TEXT DEFAULT 'carrusel', -- 'carrusel', 'pregunta', 'respuesta'
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error al crear la tabla tbl_costos_produccion:', err.message);
    } else {
      console.log('Tabla tbl_costos_produccion lista.');
      
      // Comprobar si está vacía para insertar el mensaje por defecto
      db.get('SELECT COUNT(*) as count FROM tbl_costos_produccion', [], (err, row) => {
        if (err) {
          console.error('Error al contar filas:', err.message);
        } else if (row.count === 0) {
          const initMsg = '¿Qué producto deseas costear hoy?';
          db.run(
            'INSERT INTO tbl_costos_produccion (descripcion, tipo_registro) VALUES (?, ?)',
            [initMsg, 'carrusel'],
            (err) => {
              if (err) console.error('Error al insertar mensaje inicial:', err.message);
              else console.log('Mensaje de bienvenida inicial insertado.');
            }
          );
        }
      });
    }
  });
}

// Endpoints API
// Obtener todos los registros o filtrados por tipo
app.get('/api/costos', (req, res) => {
  const { tipo } = req.query;
  let query = 'SELECT * FROM tbl_costos_produccion ORDER BY id ASC';
  const params = [];
  
  if (tipo) {
    query = 'SELECT * FROM tbl_costos_produccion WHERE tipo_registro = ? ORDER BY id ASC';
    params.push(tipo);
  }
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Registrar una nueva descripción/respuesta
app.post('/api/costos', (req, res) => {
  const { descripcion, tipo_registro } = req.body;
  if (!descripcion) {
    return res.status(400).json({ error: 'La descripción es obligatoria' });
  }
  
  const tipo = tipo_registro || 'carrusel';
  db.run(
    'INSERT INTO tbl_costos_produccion (descripcion, tipo_registro) VALUES (?, ?)',
    [descripcion, tipo],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({
        id: this.lastID,
        descripcion,
        tipo_registro: tipo
      });
    }
  );
});

// Limpiar la base de datos (utilidad para restaurar o resetear diálogos)
app.post('/api/clear', (req, res) => {
  db.run('DELETE FROM tbl_costos_produccion', (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    // Re-insertar mensaje inicial
    const initMsg = '¿Qué producto deseas costear hoy?';
    db.run(
      'INSERT INTO tbl_costos_produccion (descripcion, tipo_registro) VALUES (?, ?)',
      [initMsg, 'carrusel'],
      (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Base de datos reseteada con éxito' });
      }
    );
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor Express ejecutándose en http://localhost:${PORT}`);
});
