# Guía de Despliegue - Sistema de Filtro

## 📦 Arquitectura del Deployment

- **Frontend**: Vercel (archivos estáticos de `/public`)
- **Backend**: Render.com (API con Playwright)

---

## 🚀 Paso 1: Desplegar Backend en Render.com

### 1.1 Crear cuenta en Render
1. Ve a https://render.com
2. Regístrate con GitHub (recomendado)

### 1.2 Crear Web Service
1. Click en **"New +"** → **"Web Service"**
2. Conecta tu repositorio de GitHub
3. Selecciona el repositorio `sistema-de-filtro`

### 1.3 Configuración del servicio
```
Name: sistema-filtro-backend
Runtime: Node
Region: Oregon (US West) - más cercano a Perú
Branch: main
Build Command: npm install
Start Command: npm start
Plan: Free
```

### 1.4 Variables de Entorno (Environment Variables)
Agrega estas variables en la sección "Environment":
```
NODE_ENV=production
PORT=3000
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
```

### 1.5 Deploy
1. Click en **"Create Web Service"**
2. Espera 5-10 minutos mientras se instala Playwright y los navegadores
3. Copia la URL generada (ej: `https://sistema-filtro-backend.onrender.com`)

---

## 🌐 Paso 2: Desplegar Frontend en Vercel

### 2.1 Preparar frontend
Necesitas actualizar la URL del API en `/public/js/app.js`:

```javascript
// Cambiar esta línea:
const API_BASE_URL = 'http://localhost:3000/api';

// Por esta (usando tu URL de Render):
const API_BASE_URL = 'https://sistema-filtro-backend.onrender.com/api';
```

### 2.2 Crear proyecto Vercel
1. Ve a https://vercel.com
2. Regístrate con GitHub
3. Click en **"Add New"** → **"Project"**
4. Importa el repositorio `sistema-de-filtro`

### 2.3 Configuración del proyecto
```
Framework Preset: Other
Root Directory: ./
Build Command: (dejar vacío)
Output Directory: public
Install Command: (dejar vacío)
```

### 2.4 Variables de entorno (opcional)
```
NEXT_PUBLIC_API_URL=https://sistema-filtro-backend.onrender.com/api
```

### 2.5 Deploy
1. Click en **"Deploy"**
2. Espera 1-2 minutos
3. Copia la URL generada (ej: `https://sistema-filtro.vercel.app`)

---

## 🔧 Paso 3: Configurar CORS

Actualiza la variable de entorno en Render:

```
FRONTEND_URL=https://sistema-filtro.vercel.app
```

Esto permitirá que solo tu frontend de Vercel acceda al backend.

---

## ✅ Verificación

1. **Backend Health Check**:
   ```
   https://sistema-filtro-backend.onrender.com/api/health
   ```
   Debe responder: `{"status":"ok"}`

2. **Frontend**:
   - Abre tu URL de Vercel
   - Prueba buscar un RUC
   - Verifica que los resultados se muestren correctamente

---

## ⚠️ Limitaciones del Plan Gratuito

### Render.com Free Tier:
- ✅ 750 horas/mes gratis
- ⚠️ El servicio "duerme" después de 15 minutos de inactividad
- ⚠️ Primera request después de dormir tarda ~30-50 segundos en despertar
- ⚠️ 512 MB RAM (suficiente para Playwright)

### Vercel Free Tier:
- ✅ 100 GB de ancho de banda/mes
- ✅ Sin "sleep" - siempre activo
- ✅ Deploy automático en cada push

---

## 🔄 Actualizaciones Automáticas

Ambas plataformas tienen auto-deploy:

1. **Haces push a GitHub**
   ```bash
   git add .
   git commit -m "Actualización"
   git push
   ```

2. **Render** detecta el push y redespliega automáticamente (3-5 min)
3. **Vercel** detecta el push y redespliega automáticamente (1-2 min)

---

## 🐛 Troubleshooting

### Backend tarda mucho en responder
- Normal la primera vez (está despertando)
- Solución: Hacer "ping" cada 10 minutos con cron-job.org

### Error de CORS
- Verifica que `FRONTEND_URL` esté configurado correctamente
- Verifica que la URL no tenga `/` al final

### Playwright falla
- Verifica que `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0` esté configurado
- Revisa los logs en Render Dashboard

### Frontend no conecta con Backend
- Verifica que `API_BASE_URL` en `app.js` apunte a la URL correcta de Render
- Verifica que incluya `/api` al final

---

## 💰 Costos

- **Render Free**: $0/mes (con limitaciones)
- **Vercel Free**: $0/mes
- **Total**: $0/mes

Si necesitas más rendimiento:
- **Render Starter**: $7/mes (sin sleep, más RAM)

---

## 📝 Checklist de Deploy

- [ ] Backend desplegado en Render
- [ ] Health check funcionando (`/api/health`)
- [ ] Frontend desplegado en Vercel
- [ ] `API_BASE_URL` actualizado en `app.js`
- [ ] Variable `FRONTEND_URL` configurada en Render
- [ ] Prueba con RUC real
- [ ] Auto-deploy configurado en ambas plataformas
