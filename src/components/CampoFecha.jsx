import { useState, useEffect, useRef } from 'react'

/**
 * Campo de fecha en formato día/mes/año.
 *
 * El input nativo de tipo date muestra el formato del idioma del
 * navegador: un Chrome configurado en inglés presenta mm/dd/aaaa aunque
 * la página declare español, y no hay forma estándar de cambiarlo.
 *
 * La solución: se muestra un campo de texto con el formato local y se
 * mantiene un input date oculto para el selector de calendario. El valor
 * que sale sigue siendo ISO (aaaa-mm-dd), que es lo que espera Postgres.
 */
export default function CampoFecha({
  value,
  onChange,
  className = 'form-control',
  max,
  min,
  disabled,
  id,
  autoFocus,
}) {
  const [texto, setTexto] = useState('')
  const refNativo = useRef(null)

  useEffect(() => {
    setTexto(isoALocal(value))
  }, [value])

  const alEscribir = (e) => {
    const v = e.target.value
    setTexto(v)

    const iso = localAIso(v)
    if (iso) onChange(iso)
    else if (v === '') onChange('')
  }

  const alPerderFoco = () => {
    // Al salir del campo se normaliza lo escrito, o se restaura el valor
    // anterior si quedó incompleto
    const iso = localAIso(texto)
    if (iso) setTexto(isoALocal(iso))
    else setTexto(isoALocal(value))
  }

  const abrirCalendario = () => {
    if (disabled) return
    const el = refNativo.current
    if (!el) return

    // showPicker es lo correcto, pero no existe en navegadores antiguos
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch {
        /* algunos navegadores lo bloquean fuera de un gesto directo */
      }
    }
    el.focus()
    el.click()
  }

  return (
    <div className="campo-fecha">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className={className}
        value={texto}
        onChange={alEscribir}
        onBlur={alPerderFoco}
        placeholder="dd/mm/aaaa"
        maxLength={10}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
      />

      <button
        type="button"
        className="campo-fecha-boton"
        onClick={abrirCalendario}
        disabled={disabled}
        aria-label="Abrir calendario"
        tabIndex={-1}
      >
        📅
      </button>

      <input
        ref={refNativo}
        type="date"
        className="campo-fecha-nativo"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        max={max}
        min={min}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}

/** aaaa-mm-dd → dd/mm/aaaa */
function isoALocal(iso) {
  if (!iso) return ''
  const partes = String(iso).slice(0, 10).split('-')
  if (partes.length !== 3) return ''
  const [a, m, d] = partes
  return `${d}/${m}/${a}`
}

/** dd/mm/aaaa → aaaa-mm-dd, validando que la fecha exista */
function localAIso(local) {
  if (!local) return null

  const limpio = String(local).replace(/[^\d/]/g, '')
  const partes = limpio.split('/')
  if (partes.length !== 3) return null

  const [d, m, a] = partes
  if (d.length < 1 || m.length < 1 || a.length !== 4) return null

  const dia = Number(d)
  const mes = Number(m)
  const anio = Number(a)

  if (!dia || !mes || !anio) return null
  if (mes < 1 || mes > 12) return null
  if (dia < 1 || dia > 31) return null
  if (anio < 1900 || anio > 2200) return null

  // Rechaza fechas inexistentes como 31/02
  const fecha = new Date(anio, mes - 1, dia)
  if (fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return null

  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}
