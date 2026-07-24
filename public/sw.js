/* =====================================================================
   Service Worker · Condominios PyPCloud

   Cambiar VERSION en cada despliegue fuerza la actualización en todos
   los dispositivos: al detectar una versión distinta, el navegador
   instala el nuevo, limpia las cachés antiguas y avisa a la aplicación.

   Sin esto, un usuario con la PWA instalada puede quedarse con archivos
   de una compilación anterior que ya no existen en el servidor, y el
   resultado es una pantalla en blanco.
   ===================================================================== */

const VERSION = 'v3'
const CACHE_ACTUAL = `condominios-${VERSION}`

self.addEventListener('install', () => {
  // No esperar a que se cierren las pestañas antiguas
  self.skipWaiting()
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      // Elimina cualquier caché de versiones anteriores
      const nombres = await caches.keys()
      await Promise.all(
        nombres
          .filter((n) => n.startsWith('condominios-') && n !== CACHE_ACTUAL)
          .map((n) => caches.delete(n))
      )

      await self.clients.claim()

      const clientes = await self.clients.matchAll({ type: 'window' })
      for (const c of clientes) {
        c.postMessage({ tipo: 'SW_ACTUALIZADO', version: VERSION })
      }
    })()
  )
})

/**
 * No se cachean los recursos de la aplicación.
 *
 * Vite genera nombres con hash en cada compilación, así que el navegador
 * ya los cachea correctamente por sí solo. Interceptarlos aquí es lo que
 * provoca que se sirvan archivos obsoletos tras un despliegue.
 */
self.addEventListener('fetch', (evento) => {
  // El HTML siempre desde la red: es quien referencia los archivos con
  // hash, y una versión cacheada apuntaría a archivos ya inexistentes.
  if (evento.request.mode === 'navigate') {
    evento.respondWith(
      fetch(evento.request).catch(
        () =>
          new Response(
            '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
              '<meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<title>Sin conexion</title></head><body style="font-family:system-ui;' +
              'display:flex;align-items:center;justify-content:center;height:100vh;' +
              'margin:0;background:#f1f5f9;color:#0f172a;text-align:center;padding:20px">' +
              '<div><div style="font-size:2.5rem;margin-bottom:12px">&#128225;</div>' +
              '<h1 style="font-size:1.1rem;margin:0 0 8px">Sin conexi&oacute;n</h1>' +
              '<p style="color:#64748b;font-size:0.9rem;margin:0">' +
              'Verifique su conexi&oacute;n a internet e intente de nuevo.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
      )
    )
  }
})

self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'SALTAR_ESPERA') {
    self.skipWaiting()
  }
  if (evento.data?.tipo === 'VERSION') {
    evento.ports[0]?.postMessage({ version: VERSION })
  }
})

/* ------------------------------------------------ notificaciones push */

self.addEventListener('push', (evento) => {
  let datos = {}

  try {
    datos = evento.data ? evento.data.json() : {}
  } catch {
    datos = { title: 'Condominio', body: evento.data ? evento.data.text() : '' }
  }

  const titulo = datos.title || 'Condominio'

  const opciones = {
    body: datos.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: datos.tag || 'condominio',
    data: { url: datos.url || '/' },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  }

  evento.waitUntil(self.registration.showNotification(titulo, opciones))
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()

  const destino = evento.notification.data?.url || '/'

  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url.includes(self.location.origin) && 'focus' in v) {
          v.navigate(destino)
          return v.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(destino)
      }
    })
  )
})
