import { useEffect, useRef, useState } from 'react'
import { comprimirImagen, formatearTamano } from '../lib/imagenes'
import { filtrarSugerencias } from '../lib/formato'

/** Panel lateral para formularios. Evita perder el listado de fondo. */
export function Panel({ abierto, titulo, onCerrar, children, ancho = 480 }) {
  useEffect(() => {
    if (!abierto) return
    const esc = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div className="panel-fondo" onClick={onCerrar}>
      <div
        className="panel-lateral"
        style={{ maxWidth: ancho }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="panel-cabecera">
          <h3>{titulo}</h3>
          <button className="panel-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="panel-cuerpo">{children}</div>
      </div>
    </div>
  )
}

/**
 * Menú de acciones híbrido (Cero Soporte).
 * En escritorio muestra los botones directamente en línea.
 * En móvil muestra un botón "Gestionar ▾" que despliega la hoja inferior.
 */
export function MenuAcciones({ acciones }) {
  const [abierto, setAbierto] = useState(false)
  const [esMovil, setEsMovil] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  )

  // Escuchar cambios de tamaño de pantalla
  useEffect(() => {
    const alRedimensionar = () => setEsMovil(window.innerWidth <= 768)
    window.addEventListener('resize', alRedimensionar)
    return () => window.removeEventListener('resize', alRedimensionar)
  }, [])

  // Controlar el cierre de la hoja inferior en móvil
  useEffect(() => {
    if (!abierto || !esMovil) return
    const esc = (e) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [abierto, esMovil])

  const visibles = acciones.filter((a) => !a.oculto)
  if (!visibles.length) return null

  return (
    <>
      <style>{`
        .acciones-hibridas { 
          display: flex; 
          gap: 6px; 
          justify-content: flex-end; 
          align-items: center; 
        }
        .btn-accion-linea { 
          padding: 4px 8px; 
          font-size: 0.8rem; 
          border-radius: 4px; 
          border: 1px solid #d1d5db; 
          background: #fff; 
          cursor: pointer; 
          display: inline-flex; 
          align-items: center; 
          gap: 4px; 
          color: #374151; 
          white-space: nowrap; 
          transition: all 0.2s; 
        }
        .btn-accion-linea:hover { 
          background: #f3f4f6; 
          border-color: #9ca3af; 
        }
        .btn-accion-linea.peligro { 
          color: #dc2626; 
          border-color: #fca5a5; 
        }
        .btn-accion-linea.peligro:hover { 
          background: #fef2f2; 
          border-color: #ef4444; 
        }
        .btn-accion-movil { 
          padding: 6px 12px; 
          font-size: 0.85rem; 
          border-radius: 6px; 
          border: 1px solid #d1d5db; 
          background: #fff; 
          font-weight: 500; 
          cursor: pointer; 
          color: #111827; 
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .btn-accion-movil:active {
          background: #f3f4f6;
        }
        
        @media (min-width: 769px) {
          .acciones-movil-trigger { display: none; }
        }
        @media (max-width: 768px) {
          .acciones-escritorio { display: none !important; }
          .acciones-movil-trigger { display: inline-block; }
        }
      `}</style>
      
      <div className="acciones-hibridas" onClick={(e) => e.stopPropagation()}>
        {/* VISTA ESCRITORIO: Botones en línea directamente visibles */}
        <div className="acciones-escritorio" style={{ display: 'flex', gap: '6px' }}>
          {visibles.map((a, i) => (
            <button
              key={i}
              className={`btn-accion-linea ${a.peligro ? 'peligro' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                a.onClick()
              }}
              disabled={a.desactivado}
              title={a.titulo || a.texto}
            >
              {a.icono && <span aria-hidden="true">{a.icono}</span>}
              {a.texto}
            </button>
          ))}
        </div>

        {/* VISTA MÓVIL: Botón "Gestionar" y hoja inferior original */}
        <div className="acciones-movil-trigger">
          <button 
            className="btn-accion-movil"
            onClick={(e) => {
              e.stopPropagation()
              setAbierto(true)
            }}
          >
            Gestionar ▾
          </button>

          {abierto && esMovil && (
            <div className="hoja-fondo" onClick={() => setAbierto(false)}>
              <div className="hoja-inferior" onClick={(e) => e.stopPropagation()}>
                <div className="hoja-asa" />
                {visibles.map((a, i) => (
                  <button
                    key={i}
                    className={`menu-opcion ${a.peligro ? 'peligro' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setAbierto(false)
                      a.onClick()
                    }}
                    disabled={a.desactivado}
                  >
                    {a.icono && <span aria-hidden="true">{a.icono}</span>}
                    {a.texto}
                  </button>
                ))}
                <button className="menu-opcion cancelar" onClick={() => setAbierto(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** Diálogo de confirmación. Reemplaza a window.confirm. */
export function Confirmar({ abierto, titulo, mensaje, textoConfirmar = 'Confirmar', peligro, onConfirmar, onCancelar }) {
  if (!abierto) return null

  return (
    <div className="panel-fondo" onClick={onCancelar}>
      <div className="dialogo" onClick={(e) => e.stopPropagation()} role="alertdialog">
        <h3>{titulo}</h3>
        <p>{mensaje}</p>
        <div className="dialogo-botones">
          <button className="btn btn-secundario" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className={`btn ${peligro ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirmar}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Avisos temporales que no interrumpen el trabajo. */
export function Aviso({ tipo = 'exito', children, onCerrar }) {
  useEffect(() => {
    if (!onCerrar) return
    const t = setTimeout(onCerrar, 6000)
    return () => clearTimeout(t)
  }, [onCerrar])

  if (!children) return null

  return (
    <div className={`alerta alerta-${tipo}`}>
      <span>{children}</span>
      {onCerrar && (
        <button className="alerta-cerrar" onClick={onCerrar} aria-label="Cerrar">
          ×
        </button>
      )}
    </div>
  )
}

export function Vacio({ icono = '📋', titulo, mensaje, accion }) {
  return (
    <div className="estado-vacio">
      <div className="estado-vacio-icono" aria-hidden="true">
        {icono}
      </div>
      <strong>{titulo}</strong>
      {mensaje && <p>{mensaje}</p>}
      {accion}
    </div>
  )
}

export function Cargador({ texto = 'Cargando…' }) {
  return (
    <div className="cargador">
      <div className="spinner" />
      <span>{texto}</span>
    </div>
  )
}

/** Tarjeta de indicador para el panel de control. */
export function Indicador({ etiqueta, valor, detalle, color = 'neutro', icono }) {
  return (
    <div className={`indicador indicador-${color}`}>
      <div className="indicador-cabecera">
        <span className="indicador-etiqueta">{etiqueta}</span>
        {icono && (
          <span className="indicador-icono" aria-hidden="true">
            {icono}
          </span>
        )}
      </div>
      <strong className="indicador-valor">{valor}</strong>
      {detalle && <span className="indicador-detalle">{detalle}</span>}
    </div>
  )
}

/**
 * Selector de imagen con vista previa y compresión automática.
 * Muestra cuánto se redujo el archivo, para que el usuario entienda
 * por qué la subida es rápida incluso con conexiones lentas.
 */
export function SelectorImagen({ valorActual, onSeleccion, etiqueta = 'Imagen', ayuda, redonda }) {
  const [vista, setVista] = useState(valorActual || null)
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  // Rastrea la URL temporal de la vista previa para poder liberarla y no
  // acumular blobs en memoria si el usuario prueba varias imágenes.
  const objectUrlRef = useRef(null)

  useEffect(() => {
    setVista(valorActual || null)
  }, [valorActual])

  // Al desmontar, liberar cualquier vista previa pendiente.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const elegir = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    if (!file.type.startsWith('image/')) {
      setError('Seleccione un archivo de imagen.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('La imagen es demasiado grande. Máximo 10 MB.')
      return
    }

    try {
      const res = await comprimirImagen(file, { maxAncho: 512, maxAlto: 512 })

      // Liberar la vista previa anterior antes de crear la nueva.
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      const nuevaUrl = URL.createObjectURL(res.blob)
      objectUrlRef.current = nuevaUrl

      setVista(nuevaUrl)
      setInfo(
        `${formatearTamano(res.tamanoOriginal)} → ${formatearTamano(res.tamanoFinal)} (WebP)`
      )
      onSeleccion(file)
    } catch (err) {
      setError(err.message || 'No se pudo procesar la imagen.')
    }
  }

  return (
    <div className="form-group">
      <label>{etiqueta}</label>
      <div className="selector-imagen">
        <div className={`vista-previa ${redonda ? 'redonda' : ''}`}>
          {vista ? (
            <img src={vista} alt="" />
          ) : (
            <span className="vista-previa-vacia" aria-hidden="true">
              🖼️
            </span>
          )}
        </div>
        <div className="selector-controles">
          <button type="button" className="btn-mini btn-primary" onClick={() => inputRef.current?.click()}>
            {vista ? 'Cambiar' : 'Seleccionar'}
          </button>
          {vista && (
            <button
              type="button"
              className="btn-mini btn-secundario"
              onClick={() => {
                if (objectUrlRef.current) {
                  URL.revokeObjectURL(objectUrlRef.current)
                  objectUrlRef.current = null
                }
                setVista(null)
                setInfo(null)
                onSeleccion(null)
                if (inputRef.current) inputRef.current.value = ''
              }}
            >
              Quitar
            </button>
          )}
          {info && <small className="texto-ayuda">{info}</small>}
          {ayuda && !info && <small className="texto-ayuda">{ayuda}</small>}
          {error && <small className="texto-error">{error}</small>}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={elegir}
        style={{ display: 'none' }}
      />
    </div>
  )
}

/** 
 * Ícono flotante de ayuda contextual.
 * Al pasar el mouse o hacer clic, muestra un pequeño cuadro de texto.
 */
export function IconoAyuda({ texto }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef(null)

  // Cierra el tooltip si se hace clic fuera de él (ideal para móviles)
  useEffect(() => {
    const handleClickFuera = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setVisible(false)
      }
    }
    document.addEventListener('mousedown', handleClickFuera)
    return () => document.removeEventListener('mousedown', handleClickFuera)
  }, [])

  return (
    <div 
      className="ayuda-contextual-contenedor" 
      ref={ref}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(!visible)}
      style={{ display: 'inline-block', position: 'relative', marginLeft: '6px', verticalAlign: 'middle' }}
    >
      <span 
        className="ayuda-icono"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#e5e7eb',
          color: '#4b5563',
          fontSize: '11px',
          fontWeight: 'bold',
          cursor: 'help'
        }}
      >
        ?
      </span>

      {visible && (
        <div 
          className="ayuda-tooltip"
          style={{
            position: 'absolute',
            bottom: '120%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#1f2937',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            width: 'max-content',
            maxWidth: '250px',
            whiteSpace: 'normal',
            zIndex: 1000,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            textAlign: 'left',
            lineHeight: '1.4'
          }}
        >
          {texto}
          {/* Flecha inferior del tooltip */}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            marginLeft: '-5px',
            borderWidth: '5px',
            borderStyle: 'solid',
            borderColor: '#1f2937 transparent transparent transparent'
          }} />
        </div>
      )}
    </div>
  )
}
/**
 * Campo de texto con autocompletado tolerante a acentos y errores de tipeo.
 *
 * Pensado para conceptos que se repiten (gastos recurrentes, categorías,
 * proveedores): el usuario escribe y ve sugerencias de lo que ya usó antes,
 * aunque las escriba sin tilde o con un pequeño error ("manteni" o "mantnimiento"
 * encuentran "Mantenimiento"). Permite también texto libre: no obliga a elegir
 * de la lista.
 *
 * Props:
 *   value, onChange(texto)      → controlado como un input normal.
 *   sugerencias                 → array de strings (o de objetos + getTexto).
 *   getTexto                    → cómo sacar el string de cada sugerencia.
 *   placeholder, className, id  → passthrough al input.
 */
export function AutocompletarConcepto({
  value,
  onChange,
  sugerencias = [],
  getTexto = (x) => x,
  placeholder,
  className = 'form-control',
  id,
}) {
  const [abierto, setAbierto] = useState(false)
  const [resaltado, setResaltado] = useState(-1)
  const contenedorRef = useRef(null)

  // Cerrar el desplegable al hacer clic fuera.
  useEffect(() => {
    const alClic = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', alClic)
    return () => document.removeEventListener('mousedown', alClic)
  }, [])

  const opciones = filtrarSugerencias(sugerencias, value || '', {
    limite: 8,
    getTexto,
  }).map(getTexto)

  // Ocultar la sugerencia que sea idéntica a lo ya escrito (no aporta).
  const visibles = opciones.filter(
    (o) => o.trim().toLowerCase() !== String(value || '').trim().toLowerCase()
  )

  const elegir = (texto) => {
    onChange(texto)
    setAbierto(false)
    setResaltado(-1)
  }

  const alTeclado = (e) => {
    if (!abierto || visibles.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltado((r) => Math.min(r + 1, visibles.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado((r) => Math.max(r - 1, 0))
    } else if (e.key === 'Enter' && resaltado >= 0) {
      e.preventDefault()
      elegir(visibles[resaltado])
    } else if (e.key === 'Escape') {
      setAbierto(false)
      setResaltado(-1)
    }
  }

  return (
    <div className="autocompletar" ref={contenedorRef} style={{ position: 'relative' }}>
      <input
        id={id}
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setAbierto(true)
          setResaltado(-1)
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={alTeclado}
      />
      {abierto && visibles.length > 0 && (
        <ul
          className="autocompletar-lista"
          style={{
            position: 'absolute',
            zIndex: 30,
            left: 0,
            right: 0,
            top: '100%',
            margin: '2px 0 0',
            padding: 0,
            listStyle: 'none',
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            maxHeight: '220px',
            overflowY: 'auto',
          }}
        >
          {visibles.map((op, i) => (
            <li
              key={op + i}
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(op)
              }}
              onMouseEnter={() => setResaltado(i)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: i === resaltado ? '#eef2ff' : 'transparent',
                fontSize: '0.95em',
              }}
            >
              {op}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
