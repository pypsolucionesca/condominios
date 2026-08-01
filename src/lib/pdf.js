import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { fmtUSD, fmtNumero, fmtFecha, fmtMesAno, etiqueta } from './formato'

const AZUL = [29, 78, 216]
const GRIS = [100, 116, 139]
const OSCURO = [15, 23, 42]
const ROJO = [220, 38, 38]
const VERDE = [22, 163, 74]

const MARGEN_PIE = 26
const MARGEN_TABLA = { left: 14, right: 14, bottom: MARGEN_PIE }

function encabezado(doc, condominio, titulo, logoDataUrl) {
  const ancho = doc.internal.pageSize.getWidth()

  doc.setFillColor(...AZUL)
  doc.rect(0, 0, ancho, 4, 'F')

  let x = 14

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', 14, 12, 18, 18)
      x = 37
    } catch {
    }
  }

  doc.setTextColor(...OSCURO)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(condominio?.name || 'Condominio', x, 20)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRIS)
  doc.text('Sistema de Gestión y Finanzas', x, 26)

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...AZUL)
  doc.text(titulo, ancho - 14, 20, { align: 'right' })

  doc.setDrawColor(226, 232, 240)
  doc.line(14, 34, ancho - 14, 34)

  return 42
}

function pie(doc, nota) {
  const paginas = doc.internal.getNumberOfPages()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(...GRIS)
    doc.setFont('helvetica', 'normal')

    if (nota && i === paginas) {
      const lineas = doc.splitTextToSize(nota, ancho - 28)
      doc.text(lineas, 14, alto - 18)
    }

    doc.text(
      `Generado el ${fmtFecha(new Date())}`,
      14,
      alto - 10
    )
    doc.text(`Página ${i} de ${paginas}`, ancho - 14, alto - 10, { align: 'right' })
  }
}

export function pdfAviso({ aviso, renglones, unidad, condominio, residentes = [], logoDataUrl }) {
  const doc = new jsPDF()
  const ancho = doc.internal.pageSize.getWidth()
  let y = encabezado(doc, condominio, 'AVISO DE COBRO', logoDataUrl)

  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'bold')
  doc.text('UNIDAD', 14, y)
  doc.text('AVISO N°', ancho / 2 + 10, y)

  doc.setTextColor(...OSCURO)
  doc.setFontSize(11)
  doc.text(unidad?.code || '—', 14, y + 6)
  doc.text(String(aviso.invoice_number), ancho / 2 + 10, y + 6)

  y += 14

  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'bold')
  doc.text('RESPONSABLE', 14, y)
  doc.text('EMISIÓN', ancho / 2 + 10, y)

  doc.setTextColor(...OSCURO)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const nombre = residentes[0]?.full_name || '—'
  doc.text(doc.splitTextToSize(nombre, ancho / 2 - 24), 14, y + 6)
  doc.text(fmtFecha(aviso.issue_date), ancho / 2 + 10, y + 6)

  y += 14

  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'bold')
  doc.text('PERÍODO', 14, y)
  doc.text('VENCIMIENTO', ancho / 2 + 10, y)

  doc.setTextColor(...OSCURO)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(fmtMesAno(aviso.issue_date), 14, y + 6)

  const vencido =
    ['emitido', 'parcial'].includes(aviso.status) &&
    new Date(aviso.due_date) < new Date(new Date().toISOString().slice(0, 10))

  doc.setTextColor(...(vencido ? ROJO : OSCURO))
  doc.setFont('helvetica', 'bold')
  doc.text(fmtFecha(aviso.due_date), ancho / 2 + 10, y + 6)

  y += 16

  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Tipo', 'Monto']],
    body: (renglones || []).map((r) => [
      r.description,
      etiqueta(r.kind),
      fmtUSD(r.amount),
    ]),
    theme: 'striped',
    headStyles: { fillColor: AZUL, fontSize: 9, halign: 'left' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 38 },
      2: { cellWidth: 32, halign: 'right' },
    },
    styles: { fontSize: 9, cellPadding: 4 },
    margin: MARGEN_TABLA,
  })

  y = doc.lastAutoTable.finalY + 8

  const filas = [['Subtotal', fmtUSD(aviso.subtotal)]]
  if (Number(aviso.previous_balance) > 0) {
    filas.push(['Saldo anterior', fmtUSD(aviso.previous_balance)])
  }
  if (Number(aviso.credit_applied) > 0) {
    filas.push(['Saldo a favor aplicado', `- ${fmtUSD(aviso.credit_applied)}`])
  }
  filas.push(['TOTAL A PAGAR', fmtUSD(aviso.total)])

  autoTable(doc, {
    startY: y,
    body: filas,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { halign: 'right', cellWidth: ancho - 76 },
      1: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
    },
    margin: MARGEN_TABLA,
    didParseCell: (data) => {
      if (data.row.index === filas.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 12
        data.cell.styles.textColor = AZUL
      }
    },
  })

  y = doc.lastAutoTable.finalY + 6

  if (aviso.exchange_rate) {
    doc.setFontSize(9)
    doc.setTextColor(...GRIS)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Equivalente: Bs. ${fmtNumero(Number(aviso.total) * Number(aviso.exchange_rate))} ` +
        `(tasa Bs. ${fmtNumero(aviso.exchange_rate)} del día de emisión)`,
      ancho - 14,
      y,
      { align: 'right' }
    )
    y += 8
  }

  if (aviso.status === 'pagado' || aviso.status === 'anulado') {
    doc.setFontSize(28)
    doc.setTextColor(...(aviso.status === 'pagado' ? VERDE : ROJO))
    doc.setFont('helvetica', 'bold')
    doc.text(aviso.status === 'pagado' ? 'PAGADO' : 'ANULADO', ancho / 2, y + 16, {
      align: 'center',
      angle: 8,
    })
  }

  pie(doc, condominio?.invoice_notes)
  return doc
}

export function pdfEstadoCuenta({ unidad, movimientos, condominio, saldo, logoDataUrl }) {
  const doc = new jsPDF()
  const ancho = doc.internal.pageSize.getWidth()
  let y = encabezado(doc, condominio, 'ESTADO DE CUENTA', logoDataUrl)

  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'bold')
  doc.text('UNIDAD', 14, y)
  doc.setTextColor(...OSCURO)
  doc.setFontSize(12)
  doc.text(unidad?.code || '—', 14, y + 7)

  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text('SALDO ACTUAL', ancho - 14, y, { align: 'right' })

  const debe = Number(saldo) > 0
  doc.setFontSize(15)
  doc.setTextColor(...(debe ? ROJO : Number(saldo) < 0 ? VERDE : OSCURO))
  doc.text(
    Number(saldo) === 0 ? 'Solvente' : fmtUSD(Math.abs(saldo)),
    ancho - 14,
    y + 8,
    { align: 'right' }
  )

  if (Number(saldo) !== 0) {
    doc.setFontSize(8)
    doc.setTextColor(...GRIS)
    doc.text(debe ? 'Saldo pendiente' : 'Saldo a favor', ancho - 14, y + 13, {
      align: 'right',
    })
  }

  y += 22

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Concepto', 'Cargo', 'Abono', 'Saldo']],
    body: (movimientos || []).map((m) => [
      fmtFecha(m.entry_date),
      m.description,
      Number(m.debit_usd) > 0 ? fmtUSD(m.debit_usd) : '',
      Number(m.credit_usd) > 0 ? fmtUSD(m.credit_usd) : '',
      fmtUSD(m.running_balance),
    ]),
    theme: 'striped',
    headStyles: { fillColor: AZUL, fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
    },
    margin: MARGEN_TABLA,
  })

  pie(doc, condominio?.invoice_notes)
  return doc
}

export function pdfInformeGastos({ condominio, gastos, cuentas, desde, hasta, logoDataUrl }) {
  const doc = new jsPDF()
  const ancho = doc.internal.pageSize.getWidth()
  let y = encabezado(doc, condominio, 'INFORME DE GASTOS', logoDataUrl)

  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')
  doc.text(`Período: ${fmtFecha(desde)} al ${fmtFecha(hasta)}`, 14, y)
  y += 10

  const total = (gastos || []).reduce((s, g) => s + Number(g.amount_usd || 0), 0)

  const porCategoria = {}
  for (const g of gastos || []) {
    const c = g.expense_categories?.name || 'Sin categoría'
    porCategoria[c] = (porCategoria[c] || 0) + Number(g.amount_usd || 0)
  }

  const categorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])

  if (categorias.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Categoría', 'Monto', '%']],
      body: categorias.map(([nombre, monto]) => [
        nombre,
        fmtUSD(monto),
        total > 0 ? `${((monto / total) * 100).toFixed(1)}%` : '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: AZUL, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3.5 },
      columnStyles: {
        1: { halign: 'right', cellWidth: 32 },
        2: { halign: 'right', cellWidth: 22 },
      },
      margin: MARGEN_TABLA,
    })
    y = doc.lastAutoTable.finalY + 10
  }

  doc.setFontSize(11)
  doc.setTextColor(...OSCURO)
  doc.setFont('helvetica', 'bold')
  doc.text('Detalle de gastos', 14, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Concepto', 'Beneficiario', 'Cuenta', 'Monto']],
    body: (gastos || []).map((g) => [
      fmtFecha(g.expense_date),
      g.description,
      g.payees?.full_name || g.supplier || '—',
      g.accounts?.name || '—',
      fmtUSD(g.amount_usd),
    ]),
    foot: [['', '', '', 'TOTAL', fmtUSD(total)]],
    theme: 'striped',
    headStyles: { fillColor: AZUL, fontSize: 8.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: OSCURO, fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 34 },
      3: { cellWidth: 28 },
      4: { cellWidth: 26, halign: 'right' },
    },
    margin: MARGEN_TABLA,
  })

  y = doc.lastAutoTable.finalY + 12

  if (cuentas?.length) {
    if (y > doc.internal.pageSize.getHeight() - 60) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(11)
    doc.setTextColor(...OSCURO)
    doc.setFont('helvetica', 'bold')
    doc.text('Saldos disponibles', 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Cuenta', 'Tipo', 'Moneda', 'Saldo']],
      body: cuentas.map((c) => [
        c.name,
        etiqueta(c.kind),
        c.currency,
        c.currency === 'USD'
          ? fmtUSD(c.current_balance)
          : `Bs. ${fmtNumero(c.current_balance)}`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: AZUL, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3.5 },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
      margin: MARGEN_TABLA,
    })
  }

  pie(doc, 'Documento informativo generado para consulta de los propietarios.')
  return doc
}

export function pdfReciboPago({ pago, beneficiario, condominio, logoDataUrl }) {
  const doc = new jsPDF()
  const ancho = doc.internal.pageSize.getWidth()
  const alto = doc.internal.pageSize.getHeight()

  const mitad = (offsetY, copia) => {
    let y = offsetY

    doc.setFillColor(...AZUL)
    doc.rect(0, y, ancho, 3, 'F')
    y += 12

    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', 14, y - 4, 16, 16)
      } catch {
      }
    }

    const x = logoDataUrl ? 34 : 14

    doc.setTextColor(...OSCURO)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(condominio?.name || 'Condominio', x, y + 2)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRIS)
    doc.text(copia, x, y + 7)

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...AZUL)
    doc.text('RECIBO DE PAGO', ancho - 14, y + 2, { align: 'right' })

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRIS)
    doc.text(`N° ${String(pago.id).slice(0, 8).toUpperCase()}`, ancho - 14, y + 7, {
      align: 'right',
    })

    y += 16
    doc.setDrawColor(226, 232, 240)
    doc.line(14, y, ancho - 14, y)
    y += 9

    const campo = (etiquetaTexto, valor, px, py) => {
      doc.setFontSize(7)
      doc.setTextColor(...GRIS)
      doc.setFont('helvetica', 'bold')
      doc.text(etiquetaTexto, px, py)
      doc.setFontSize(10)
      doc.setTextColor(...OSCURO)
      doc.setFont('helvetica', 'normal')
      doc.text(String(valor || '—'), px, py + 5.5)
    }

    campo('BENEFICIARIO', beneficiario?.full_name, 14, y)
    campo('FECHA', fmtFecha(pago.expense_date), ancho / 2 + 10, y)
    y += 14

    campo('CÉDULA / RIF', beneficiario?.national_id, 14, y)
    campo('CARGO', beneficiario?.role_title, ancho / 2 + 10, y)
    y += 14

    const formaPago = beneficiario?.bank_1_name
      ? `${beneficiario.bank_1_name} · ${beneficiario.bank_1_account || ''}`
      : beneficiario?.mobile_1_phone
      ? `Pago móvil · ${beneficiario.mobile_1_bank || ''} · ${beneficiario.mobile_1_phone}`
      : null

    if (formaPago) {
      doc.setFontSize(7)
      doc.setTextColor(...GRIS)
      doc.setFont('helvetica', 'bold')
      doc.text('FORMA DE PAGO', 14, y)
      doc.setFontSize(8.5)
      doc.setTextColor(...OSCURO)
      doc.setFont('helvetica', 'normal')
      doc.text(doc.splitTextToSize(formaPago, ancho - 32), 14, y + 5)
      y += 12
    } else {
      y += 2
    }

    // Diseño dinámico: Si el recibo tiene un descuento, la caja crece
    const tieneDeduccion = pago.deduction_usd && Number(pago.deduction_usd) > 0
    const altoCaja = tieneDeduccion ? 38 : 26

    doc.setFillColor(248, 250, 252)
    doc.roundedRect(14, y - 4, ancho - 28, altoCaja, 2, 2, 'F')

    doc.setFontSize(7)
    doc.setTextColor(...GRIS)
    doc.setFont('helvetica', 'bold')
    doc.text('CONCEPTO', 18, y + 2)

    doc.setFontSize(10)
    doc.setTextColor(...OSCURO)
    doc.setFont('helvetica', 'normal')
    const maxAnchoTexto = ancho - (tieneDeduccion ? 110 : 90)
    const concepto = doc.splitTextToSize(pago.description || '', maxAnchoTexto)
    doc.text(concepto.slice(0, tieneDeduccion ? 4 : 2), 18, y + 8)

    doc.setFontSize(7)
    doc.setTextColor(...GRIS)
    doc.setFont('helvetica', 'bold')

    if (tieneDeduccion) {
      doc.text('SALARIO BRUTO', ancho - 18, y + 2, { align: 'right' })
      doc.setFontSize(10)
      doc.setTextColor(...OSCURO)
      doc.text(pago.currency === 'VES' ? `Bs. ${fmtNumero(pago.amount)}` : fmtUSD(pago.amount), ancho - 18, y + 6, { align: 'right' })
      
      doc.setFontSize(7)
      doc.setTextColor(...GRIS)
      doc.text('DEDUCCIÓN (PRÉSTAMO)', ancho - 18, y + 11, { align: 'right' })
      doc.setFontSize(10)
      doc.setTextColor(...ROJO)
      doc.text(pago.currency === 'VES' ? `- Bs. ${fmtNumero(pago.deduction_amount)}` : `- ${fmtUSD(pago.deduction_usd)}`, ancho - 18, y + 15, { align: 'right' })
      
      doc.setFontSize(8)
      doc.setTextColor(...AZUL)
      doc.setFont('helvetica', 'bold')
      doc.text('NETO PAGADO', ancho - 18, y + 22, { align: 'right' })
      doc.setFontSize(12)
      
      const netoVES = Number(pago.amount) - Number(pago.deduction_amount)
      const netoUSD = Number(pago.amount_usd) - Number(pago.deduction_usd)
      
      doc.text(pago.currency === 'VES' ? `Bs. ${fmtNumero(netoVES)}` : fmtUSD(netoUSD), ancho - 18, y + 27, { align: 'right' })
      
      y += 42
    } else {
      doc.text('MONTO', ancho - 18, y + 2, { align: 'right' })
      doc.setFontSize(14)
      doc.setTextColor(...AZUL)
      doc.text(
        pago.currency === 'VES' ? `Bs. ${fmtNumero(pago.amount)}` : fmtUSD(pago.amount),
        ancho - 18,
        y + 10,
        { align: 'right' }
      )

      if (pago.currency === 'VES') {
        doc.setFontSize(7.5)
        doc.setTextColor(...GRIS)
        doc.setFont('helvetica', 'normal')
        doc.text(`Equiv. ${fmtUSD(pago.amount_usd)}`, ancho - 18, y + 16, { align: 'right' })
      }
      y += 32
    }

    doc.setDrawColor(148, 163, 184)
    doc.line(20, y + 12, 88, y + 12)
    doc.line(ancho - 88, y + 12, ancho - 20, y + 12)

    doc.setFontSize(7.5)
    doc.setTextColor(...GRIS)
    doc.setFont('helvetica', 'normal')
    doc.text('Recibí conforme', 54, y + 17, { align: 'center' })
    doc.text('Entregado por', ancho - 54, y + 17, { align: 'center' })

    doc.setFontSize(6.5)
    doc.text(
      `Cuenta: ${pago.cuenta || '—'}  ·  Emitido ${fmtFecha(new Date())}`,
      14,
      y + 27
    )
  }

  mitad(0, 'Copia para el beneficiario')

  doc.setLineDashPattern([2, 2], 0)
  doc.setDrawColor(180, 190, 200)
  doc.line(10, alto / 2, ancho - 10, alto / 2)
  doc.setLineDashPattern([], 0)

  doc.setFontSize(6.5)
  doc.setTextColor(...GRIS)
  doc.text('- - - corte aquí - - -', ancho / 2, alto / 2 - 2, { align: 'center' })

  mitad(alto / 2 + 4, 'Copia para el condominio')

  return doc
}

export function pdfHistorialBeneficiario({ beneficiario, pagos, condominio, desde, hasta, logoDataUrl }) {
  const doc = new jsPDF()
  const ancho = doc.internal.pageSize.getWidth()
  let y = encabezado(doc, condominio, 'HISTORIAL DE PAGOS', logoDataUrl)

  doc.setFontSize(12)
  doc.setTextColor(...OSCURO)
  doc.setFont('helvetica', 'bold')
  doc.text(beneficiario?.full_name || '—', 14, y)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...GRIS)
  const detalle = [
    beneficiario?.role_title,
    beneficiario?.national_id ? `C.I./RIF ${beneficiario.national_id}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')
  if (detalle) doc.text(detalle, 14, y + 6)

  doc.setFontSize(8.5)
  doc.text(`Período: ${fmtFecha(desde)} al ${fmtFecha(hasta)}`, ancho - 14, y, {
    align: 'right',
  })

  y += 16

  const total = (pagos || []).reduce((s, p) => s + (Number(p.amount_usd || 0) - (Number(p.deduction_usd) || 0)), 0)

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Concepto', 'Cuenta', 'Monto NETO', 'Equiv. USD']],
    body: (pagos || []).map((p) => {
      const netVES = Number(p.amount) - (Number(p.deduction_amount) || 0)
      const netUSD = Number(p.amount_usd) - (Number(p.deduction_usd) || 0)
      return [
        fmtFecha(p.expense_date),
        p.description,
        p.accounts?.name || '—',
        p.currency === 'VES' ? `Bs. ${fmtNumero(netVES)}` : fmtUSD(netUSD),
        fmtUSD(netUSD),
      ]
    }),
    foot: [['', '', '', 'TOTAL', fmtUSD(total)]],
    theme: 'striped',
    headStyles: { fillColor: AZUL, fontSize: 8.5 },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: OSCURO,
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    styles: { fontSize: 8.5, cellPadding: 3.5 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30 },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
    margin: MARGEN_TABLA,
  })

  y = doc.lastAutoTable.finalY + 12

  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `${(pagos || []).length} pago(s) registrado(s) en el período.`,
    14,
    y
  )

  pie(doc, 'Documento informativo. No constituye constancia de trabajo ni liquidación de prestaciones.')
  return doc
}

export async function logoParaPdf(url) {
  if (!url) return null
  try {
    const resp = await fetch(url, { mode: 'cors' })
    const blob = await resp.blob()
    return await new Promise((resolve) => {
      const lector = new FileReader()
      lector.onloadend = () => resolve(lector.result)
      lector.onerror = () => resolve(null)
      lector.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export function descargarPdf(doc, nombre) {
  doc.save(nombre)
}

export function abrirPdf(doc) {
  window.open(doc.output('bloburl'), '_blank')
}