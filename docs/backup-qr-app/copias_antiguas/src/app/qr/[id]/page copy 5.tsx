'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { qrService } from '@/services/qr.service';

interface QrRedirectProps {
  params: {
    id: string;
  };
}

interface LocationData {
  latitude: number | null;
  longitude: number | null;
  country: string;
  city: string;
}

export default function QrRedirect({ params }: QrRedirectProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string>('Iniciando...');
  const redirectUrlRef = useRef<string | null>(null);
  const hasExecutedRef = useRef(false);

  useEffect(() => {
    async function handleProcess() {
      // Evitar múltiples ejecuciones
      if (hasExecutedRef.current) return;
      hasExecutedRef.current = true;

      try {
        // 1. Primero obtener la URL de redirección
        setStatus('Obteniendo URL de redirección...');
        const response = await qrService.getPublicRedirectUrl(params.id);
        const redirectUrl = response.data.url || null;
        redirectUrlRef.current = redirectUrl;

        // 2. Intentar obtener la geolocalización con un timeout
        setStatus('Obteniendo ubicación...');
        try {
          const locationPromise = new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error('Geolocalización no disponible'));
              return;
            }

            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 3000,
              enableHighAccuracy: false
            });
          });

          // Esperar la geolocalización con timeout
          const position = await locationPromise;

          // Si llegamos aquí, tenemos la ubicación
          const locationData: LocationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            country: 'No especificado',
            city: 'No especificado'
          };

          // Registrar el escaneo con ubicación
          await qrService.createScanStats(params.id, locationData);

        } catch (geoError) {
          // Si falla la geolocalización, registrar sin ubicación
          const defaultLocation: LocationData = {
            latitude: null,
            longitude: null,
            country: 'No especificado',
            city: 'No especificado'
          };

          await qrService.createScanStats(params.id, defaultLocation);
        }

        // Siempre redirigir al final, independientemente de la geolocalización
        if (!redirectUrlRef.current) {
          throw new Error('No se obtuvo una URL de redirección válida');
        }
        window.location.href = redirectUrlRef.current;

      } catch (error) {
        console.error('Error en el proceso:', error);
        setStatus('Error en el proceso. Reintentando...');
        // Si hay error, permitir reintentar
        hasExecutedRef.current = false;
        
        // Si tenemos URL de redirección, usarla aunque haya error
        if (!redirectUrlRef.current) {
          throw new Error('No se obtuvo una URL de redirección válida');
        }
        window.location.href = redirectUrlRef.current;
      }
    }

    handleProcess();
  }, [params.id]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">{status}</p>
      </div>
    </div>
  );
}