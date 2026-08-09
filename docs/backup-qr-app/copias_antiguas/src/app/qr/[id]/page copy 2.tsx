//funciona localizacion y redireccion mas se generan dos registros de escaneso
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [processStatus, setProcessStatus] = useState<string>('Iniciando...');
  const processingRef = useRef(false);

  const getGeolocation = useCallback(async (): Promise<LocationData> => {
    if (!navigator.geolocation) {
      throw new Error('Tu navegador no soporta geolocalización');
    }

    setProcessStatus('Obteniendo ubicación...');

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            timeout: 10000,
            maximumAge: 0,
            enableHighAccuracy: true
          }
        );
      });

      setProcessStatus('Ubicación obtenida correctamente');

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`
        );
        const data = await response.json();

        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          country: data.address?.country || 'No especificado',
          city: data.address?.city || data.address?.town || 'No especificado'
        };
      } catch (error) {
        return {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          country: 'No especificado',
          city: 'No especificado'
        };
      }
    } catch (error) {
      if (error instanceof GeolocationPositionError) {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            throw new Error('Permiso de ubicación denegado');
          case error.POSITION_UNAVAILABLE:
            throw new Error('Información de ubicación no disponible');
          case error.TIMEOUT:
            throw new Error('Se agotó el tiempo para obtener la ubicación');
          default:
            throw new Error('Error desconocido al obtener la ubicación');
        }
      }
      throw error;
    }
  }, [setProcessStatus]);

  const processQrRedirect = useCallback(async () => {
    if (processingRef.current) {
      console.log('Proceso ya en ejecución');
      return;
    }

    try {
      processingRef.current = true;
      console.log('Iniciando proceso de redirección');

      // 1. Obtener la geolocalización
      const locationData = await getGeolocation();
      console.log('Ubicación obtenida:', locationData);

      // 2. Obtener la URL de redirección
      setProcessStatus('Obteniendo URL de redirección...');
      console.log('Solicitando URL de redirección...');
      const response = await qrService.getPublicRedirectUrl(params.id);
      const redirectUrl = response.data.url || null;
      console.log('URL de redirección obtenida:', redirectUrl);

      // 3. Registrar el escaneo
      setProcessStatus('Registrando escaneo...');
      console.log('Registrando escaneo...');
      await qrService.createScanStats(params.id, locationData);
      console.log('Escaneo registrado exitosamente');

      // 4. Realizar la redirección
      setProcessStatus('Redirigiendo...');
      console.log('Iniciando redirección a:', redirectUrl);
      if (redirectUrl) {
        window.location.replace(redirectUrl);
      } else {
        throw new Error('No se obtuvo una URL de redirección válida');
      }
      
    } catch (error) {
      console.error('Error en el proceso:', error);
      const message = error instanceof Error ? error.message : 'Error desconocido';
      setErrorMessage(message);
      setIsLoading(false);
      processingRef.current = false;
    }
  }, [params.id, getGeolocation, setProcessStatus, setErrorMessage, setIsLoading]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (mounted) {
        await processQrRedirect();
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [params.id, processQrRedirect]);

  const handleRetry = async () => {
    setIsLoading(true);
    setErrorMessage('');
    processingRef.current = false;
    await processQrRedirect();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center p-4">
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              {processStatus}
            </p>
          </>
        ) : errorMessage ? (
          <div className="text-red-600 dark:text-red-400">
            <p>Error: {errorMessage}</p>
            <button 
              onClick={handleRetry}
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