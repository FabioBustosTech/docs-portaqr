'use client'
import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const QRScanner = () => {
  const [result, setResult] = useState('');
  const scannerRef = useRef(null);

  useEffect(() => {
    if (scannerRef.current) {
      const config = {
        fps: 10, // Frames per second
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        videoConstraints: {
          facingMode: 'environment' // Usar la cámara trasera
        }
      };

      const qrScanner = new Html5QrcodeScanner(
        'qr-reader', 
        config,
        false
      );

      qrScanner.render(
        (decodedText, decodedResult) => {
          setResult(decodedText);
        },
        (error) => {
          console.warn(`QR Code Scan Error: ${error}`);
        }
      );

      // Limpiar el escáner al desmontar el componente
      return () => {
        qrScanner.clear().catch(error => {
          console.error('Failed to clear QR Code scanner:', error);
        });
      };
    }
  }, []);

  return (
    <div>
      <h1>Escáner de QR</h1>
      <div id="qr-reader" ref={scannerRef} style={{ width: '100%' }}></div>
      <p>Resultado: {result}</p>
    </div>
  );
};

export default QRScanner;