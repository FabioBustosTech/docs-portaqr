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
  latitude: number;
  longitude: number;
  country: string;
  city: string;
}

export default function QrRedirect({ params }: QrRedirectProps) {
  const router = useRouter();
  const scanRegistered = useRef(false);
  const redirectInitiated = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    const getGeolocation = (): Promise<LocationData> => {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocalización no disponible'));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!isMounted) return;
            
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              country: 'No especificado',
              city: 'No especificado'
            });
          },
          (error) => {
            if (!isMounted) return;
            reject(new Error(`Error de geolocalización: ${error.message}`));
          },
          {
            timeout: 10000,
            maximumAge: 0,
            enableHighAccuracy: true
          }
        );
      });
    };

    const handleRedirect = async () => {
      if (redirectInitiated.current || !isMounted) return;
      redirectInitiated.current = true;

      try {
        // 1. Obtener la geolocalización
        const locationData = await getGeolocation();

        if (!isMounted) return;

        // 2. Obtener la URL de redirección
        const { redirectUrl } = await qrService.getPublicRedirectUrl(params.id, true);

        if (!isMounted) return;

        // 3. Registrar el escaneo solo si no se ha registrado antes
        if (!scanRegistered.current) {
          try {
            await qrService.createScanStats(params.id, locationData);
            scanRegistered.current = true;
          } catch (error) {
            console.warn('Error al registrar escaneo:', error);
            // Continuamos con la redirección incluso si falla el registro
          }
        }

        // 4. Realizar la redirección si el componente sigue montado
        if (isMounted) {
          window.location.href = redirectUrl;
        }
      } catch (error) {
        if (!isMounted) return;
        
        console.error('Error en el proceso:', error);
        const message = error instanceof Error ? error.message : 'Error desconocido';
        setErrorMessage(message);
        router.push('/qr-error');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Usar setTimeout para evitar problemas de hidratación
    setTimeout(() => {
      handleRedirect();
    }, 0);

    return () => {
      isMounted = false;
      redirectInitiated.current = true;
    };
  }, [params.id, router]);

  // Eliminamos los console.log para producción
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center p-4">
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Obteniendo ubicación...
            </p>
          </>
        ) : errorMessage ? (
          <div className="text-red-600 dark:text-red-400">
            <p>Error: {errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-accent-500 text-white rounded hover:bg-accent-600"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400">
            Redirigiendo...
          </p>
        )}
      </div>
    </div>
  );
}