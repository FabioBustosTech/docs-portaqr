'use client'

import { useState } from 'react'
import { QrReader } from 'react-qr-reader'

interface QRScannerProps {
  onResult?: (result: string) => void
  onError?: (error: Error) => void
}

export const QRScanner = ({ onResult, onError }: QRScannerProps) => {
  const [startScan, setStartScan] = useState(false)

  const handleScan = (result: any) => {
    if (result) {
      onResult?.(result?.text)
      setStartScan(false)
    }
  }

  const handleError = (error: Error) => {
    console.error(error)
    onError?.(error)
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {startScan ? (
        <div className="relative aspect-square w-full rounded-xl overflow-hidden">
          <QrReader
            constraints={{ facingMode: 'environment' }}
            onResult={handleScan}
            scanDelay={500}
            className="w-full h-full"
          />
          <button
            onClick={() => setStartScan(false)}
            className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-lg"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setStartScan(true)}
          className="w-full py-3 px-4 bg-accent-500 text-white rounded-lg hover:bg-accent-600 transition-colors"
        >
          Iniciar Escaneo
        </button>
      )}
    </div>
  )
} 