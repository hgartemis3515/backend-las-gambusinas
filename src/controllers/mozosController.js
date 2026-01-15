const express = require("express");

const router = express.Router();

const { listarMozos, crearMozo, obtenerMozosPorId, actualizarMozo, borrarMozo, autenticarMozo} = require("../repository/mozos.repository");

router.get("/mozos", async (req, res) => {
  const data = await listarMozos();
  res.json(data);
});

// Endpoint de prueba para verificar el usuario admin
router.get("/mozos/test/admin", async (req, res) => {
  try {
    const { autenticarMozo } = require("../repository/mozos.repository");
    const admin = await autenticarMozo('admin', 12345678);
    if (admin) {
      res.json({ 
        success: true, 
        message: 'Usuario admin encontrado',
        admin: {
          name: admin.name,
          DNI: admin.DNI,
          DNI_type: typeof admin.DNI,
          _id: admin._id
        }
      });
    } else {
      res.json({ 
        success: false, 
        message: 'Usuario admin NO encontrado' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

router.get("/mozos/:id", async (req, res) => {
  try {
    const codigomozo = req.params.id;

    const mozo = await obtenerMozosPorId(codigomozo);

    if (!mozo) {
      console.log("Estudiante no encontrado");
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    console.log('Mozo encontrado:', mozo);
    res.json(mozo);

  } catch (error) {
    console.error("Error al procesar la solicitud:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.post('/mozos', async (req, res) => {
  try {
      const data = req.body;
      const result = await crearMozo(data);
      res.json(result);
      console.log("Nuevo mozo creado:", result);
  } catch(error) {
      console.error("Error al procesar la solicitud:", error);
      res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.put('/mozos/:id', async (req, res) => {
    try{
        const id = req.params.id;
        const newData = req.body;
        
        const data = await actualizarMozo(id, newData);
        res.json(data);
        console.log("Se actualizó el mozo:", id);
    }catch(error){
        console.error('Error al actualizar el mozo', error);
        const statusCode = error.message.includes('no encontrado') ? 404 : 500;
        res.status(statusCode).json({ error: error.message || 'Error interno del servidor' });
    }
});

router.delete('/mozos/:id', async(req, res) => {
  try {
    const id = req.params.id;

    // Verificar si el mozo existe usando _id
    const mozos = require('../database/models/mozos.model');
    const mozo = await mozos.findById(id);

    if (!mozo) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const data = await borrarMozo(id);
    res.json(data);
} catch (error) {
    console.error('Error al eliminar el usuario', error);
    res.status(500).json({ message: 'Error interno del servidor' });
}
});


router.post('/mozos/auth', async (req, res) => {
  try {
      console.log('📥 Solicitud de autenticación recibida');
      console.log('   - Body completo:', JSON.stringify(req.body));
      
      const { name, DNI } = req.body;
      
      // Validar que se recibieron los datos
      if (!name || DNI === undefined || DNI === null || DNI === '') {
          console.log('❌ Datos faltantes - name:', name, 'DNI:', DNI);
          return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
      }
      
      console.log('📋 Datos recibidos:');
      console.log('   - name:', name, 'tipo:', typeof name);
      console.log('   - DNI:', DNI, 'tipo:', typeof DNI);
      
      // Convertir DNI a número
      let dniNumber;
      if (typeof DNI === 'string') {
          dniNumber = parseInt(DNI.trim(), 10);
      } else {
          dniNumber = Number(DNI);
      }
      
      // Validar que la conversión fue exitosa
      if (isNaN(dniNumber) || dniNumber <= 0) {
          console.log('❌ DNI inválido - recibido:', DNI, 'convertido:', dniNumber);
          return res.status(400).json({ message: 'Contraseña inválida' });
      }
      
      console.log('🔍 Intentando autenticar:');
      console.log('   - Usuario:', name);
      console.log('   - Contraseña (DNI):', dniNumber);
      
      // Verificar si el usuario existe con el name y DNI proporcionados
      const mozo = await autenticarMozo(name, dniNumber);
      
      if (!mozo) {
          console.log('❌ Autenticación fallida - Usuario no encontrado');
          return res.status(401).json({ message: 'Credenciales incorrectas' });
      }
      
      console.log('✅ Autenticación exitosa');
      console.log('   - Usuario:', mozo.name);
      console.log('   - ID:', mozo._id);
      
      // Devolver información del mozo autenticado
      res.json({ message: 'Mozo autenticado correctamente', mozo });
  } catch (error) {
      console.error('❌ Error al autenticar el mozo:', error);
      console.error('   - Stack:', error.stack);
      res.status(500).json({ message: 'Error interno del servidor' });
  }
});

module.exports = router;