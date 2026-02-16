# Autenticación en PWA Testigos

Sistema de autenticación implementado para la PWA de Testigos Electorales.

## 🔐 Flujo de Autenticación

### 1. Creación de Testigo (Backend)

El administrador crea un testigo desde el panel web:

```typescript
// POST /api/testigos (desde web-admin)
{
  cedula: "1234567890",
  nombres: "Juan",
  apellidos: "Pérez",
  telefono: "3001234567",
  email: "juan@example.com",
  mesaId: "mesa-123",
  campanaId: "campana-456"
}
```

**El sistema automáticamente:**
- ✅ Genera un PIN aleatorio de 6 dígitos
- ✅ Envía email al testigo con:
  - PIN de acceso
  - Número de mesa asignada
  - Instrucciones de login
- ✅ Valida límites del plan (DEMO: 3, BASICO: 20, PRO: 50, ENTERPRISE: ∞)

---

### 2. Login del Testigo (PWA)

El testigo abre la PWA en su celular y:

1. **Ingresa sus credenciales:**
   - Cédula: `1234567890`
   - PIN: `123456` (el que recibió por email)

2. **El sistema valida:**
   - ✅ Que el testigo exista
   - ✅ Que esté activo
   - ✅ Que el PIN sea correcto

3. **Si es válido, retorna:**
   ```json
   {
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "testigo": {
       "id": "testigo-123",
       "cedula": "1234567890",
       "nombres": "Juan",
       "apellidos": "Pérez"
     },
     "mesa": {
       "id": "mesa-123",
       "numero": 101,
       "totalSufragantes": 300
     },
     "elecciones": [...],
     "deviceId": "device-1234567890"
   }
   ```

---

### 3. Persistencia de Sesión

La PWA guarda en `localStorage`:

```typescript
// Token JWT (válido por 30 días)
localStorage.setItem('cuorum_testigo_token', token);

// Datos del testigo y su mesa
localStorage.setItem('cuorum_testigo_data', JSON.stringify({
  testigo: {...},
  mesa: {...},
  elecciones: [...]
}));
```

**Esto permite:**
- ✅ Funcionar offline después del primer login
- ✅ No pedir credenciales cada vez que abre la app
- ✅ Enviar reportes con autenticación válida

---

### 4. Verificación de Token

Cada vez que el testigo abre la PWA:

1. **Verifica si hay sesión guardada:**
   ```typescript
   const token = localStorage.getItem('cuorum_testigo_token');
   const data = localStorage.getItem('cuorum_testigo_data');
   ```

2. **Valida el token con el backend:**
   ```typescript
   GET /api/auth/testigos/verify
   Headers: { Authorization: Bearer <token> }
   ```

3. **Si el token es válido:**
   - ✅ Carga la app con los datos guardados
   - ✅ Permite reportar resultados

4. **Si el token expiró o es inválido:**
   - ❌ Limpia la sesión
   - ❌ Redirige a pantalla de login

---

### 5. Logout

El testigo puede cerrar sesión manualmente:

```typescript
// Botón de logout en el header
authService.logout(); // Limpia localStorage y redirige a login
```

---

## 📱 Modo Offline

**Después del primer login exitoso:**

1. ✅ El testigo puede cerrar la app y volver a abrirla sin internet
2. ✅ La app carga con los datos guardados en localStorage
3. ✅ Puede capturar resultados (se guardan en IndexedDB)
4. ✅ Cuando recupere conexión, se sincronizarán automáticamente

**Nota:** La verificación de token funciona offline - si no hay internet, la app asume que el token es válido y permite trabajar.

---

## 🔑 Gestión de PIN

### Reenviar PIN

Si el testigo pierde su PIN, el administrador puede reenviarlo:

```typescript
POST /api/testigos/:id/reenviar-pin
```

**El sistema:**
- Genera un nuevo PIN
- Invalida el anterior
- Envía email con el nuevo PIN

---

## 🛡️ Seguridad

### Token JWT

```json
{
  "testigoId": "testigo-123",
  "cedula": "1234567890",
  "mesaId": "mesa-123",
  "tipo": "testigo",
  "exp": 1709481600  // 30 días de duración
}
```

**Características:**
- ✅ Firmado con JWT_SECRET del servidor
- ✅ Duración: 30 días (ideal para día de elecciones)
- ✅ Incluye identificador `tipo: "testigo"` para distinguir de usuarios admin

### PIN

- ✅ 6 dígitos numéricos aleatorios
- ✅ Hasheado con bcrypt (cost: 12)
- ✅ Nunca se almacena en texto plano
- ✅ Solo se muestra una vez (en el email)

---

## 📊 Límites por Plan

Los testigos tienen límites separados de los usuarios:

| Plan       | Testigos Permitidos |
|------------|---------------------|
| DEMO       | 3                   |
| BASICO     | 20                  |
| PRO        | 50                  |
| ENTERPRISE | Ilimitado (999,999) |

**Nota:** Los testigos NO cuentan contra el límite de usuarios del plan.

---

## 🧪 Testing

### Login Manual

1. Crear un testigo de prueba en el backend
2. Ver el PIN en la respuesta o en los logs del email
3. Abrir la PWA: `http://localhost:5173`
4. Ingresar cédula + PIN
5. Verificar que carga correctamente con los datos de la mesa

### Verificar Modo Offline

1. Hacer login con internet
2. Cerrar DevTools Network (simular offline)
3. Refrescar la página
4. Verificar que la app carga sin internet
5. Capturar un resultado de prueba
6. Reactivar internet
7. Verificar que se sincroniza automáticamente

---

## 🐛 Troubleshooting

### "Credenciales inválidas"
- Verificar que el testigo exista en la BD
- Verificar que `activo = true`
- Verificar que el PIN sea correcto (puede haber sido regenerado)

### "Token expirado"
- El token dura 30 días
- Si expiró, el testigo debe hacer login nuevamente
- Los resultados guardados offline se sincronizarán después del nuevo login

### "No se puede conectar al servidor"
- Verificar que `VITE_API_BASE_URL` esté configurado en `.env`
- Verificar que el backend esté corriendo
- Verificar que el endpoint `/api/auth/testigos/login` responda

---

## 📝 Variables de Entorno

```env
# .env en cuorum-pwa-testigos
VITE_API_BASE_URL=http://localhost:3000/api
```

```env
# .env en backend
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=30d
RESEND_API_KEY=re_xxxxxxxxxxxx
```

---

## 🚀 Próximos Pasos

- [ ] Implementar biometría (huella/Face ID) para login rápido
- [ ] Notificaciones push cuando se asigna una mesa
- [ ] QR code en el email para login automático
- [ ] Recovery flow si olvida la cédula

---

## 📞 Soporte

Para problemas con autenticación, contactar al equipo de desarrollo o abrir un issue en Linear.
