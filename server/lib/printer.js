'use strict'

const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer')

async function printKOT (sql, io, kotData) {
  let printed = false

  try {
    const printers = await sql`
      SELECT * FROM printers WHERE active = 1 AND area = ${kotData.area || 'kitchen'}
      LIMIT 1`

    if (printers.length > 0) {
      const p = printers[0]
      const printer = new ThermalPrinter({
        type:            PrinterTypes[p.type?.toUpperCase()] || PrinterTypes.EPSON,
        interface:       `tcp://${p.ip}:${p.port || 9100}`,
        characterSet:    CharacterSet.PC852_LATIN2,
        removeSpecialCharacters: false,
        lineCharacter:   '-',
      })

      const connected = await printer.isPrinterConnected()
      if (connected) {
        printer.alignCenter()
        printer.bold(true)
        printer.setTextSize(1, 1)
        printer.println('*** K O T ***')
        printer.bold(false)
        printer.alignLeft()
        printer.println(`Order #${kotData.orderNumber}`)
        printer.println(`Type: ${(kotData.orderType || '').toUpperCase()}`)
        if (kotData.tableName) printer.println(`Table: ${kotData.tableName}`)
        if (kotData.customerName) printer.println(`Customer: ${kotData.customerName}`)
        printer.println(`Time: ${new Date().toLocaleTimeString()}`)
        printer.drawLine()

        for (const item of kotData.items || []) {
          printer.bold(true)
          printer.println(`${item.quantity || item.qty || 1}x  ${item.item_name || item.name}`)
          printer.bold(false)
          if (item.notes) printer.println(`    > ${item.notes}`)
        }

        printer.drawLine()
        printer.println(`Cashier: ${kotData.cashierName || ''}`)
        printer.cut()
        await printer.execute()
        printed = true
      }
    }
  } catch (_) {
    // Network print failed — fall through to Socket.io fallback
  }

  if (!printed && io) {
    io.emit('print:kot', kotData)
  }

  return printed
}

module.exports = { printKOT }
