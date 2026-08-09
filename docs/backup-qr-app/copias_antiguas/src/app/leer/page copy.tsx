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
      };

      const qrScanner = new Html5QrcodeScanner(
        scannerRef.current.id, 
        config,
        /* verbose= */ false
      );

      qrScanner.render(
        (decodedText, decodedResult) => {
          setResult(decodedText);
        },
        (error) => {
          console.warn(`QR Code Scan Error: ${error}`);
        }
      );

      // Clean up on component unmount
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
      <div id="qr-reader" ref={scannerRef}></div>
      <p>Resultado: {result}</p>
    </div>
  );
};

export default QRScanner;

