import { useEffect, useRef, useState } from 'react'
import { comprimirImagen, formatearTamano } from '../lib/imagenes'

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

/** Menú contextual de acciones por fila. */
export function MenuAcciones({ acciones }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const visibles = acciones.filter((a) => !a.oculto)
  if (!visibles.length) return null

  return (
    <div className="menu-acciones" ref={ref}>
      <button
        className="menu-disparador"
        onClick={(e) => {
          e.stopPropagation()
          setAbierto((v) => !v)
        }}
        aria-label="Acciones"
        aria-expanded={abierto}
      >
        ⋯
      </button>
      {abierto && (
        <div className="menu-lista">
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
              title={a.titulo}
            >
              {a.icono && <span aria-hidden="true">{a.icono}</span>}
              {a.texto}
            </button>
          ))}
        </div>
      )}
    </div>
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

  useEffect(() => {
    setVista(valorActual || null)
  }, [valorActual])

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

      setVista(URL.createObjectURL(res.blob))
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
