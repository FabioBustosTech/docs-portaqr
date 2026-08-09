'use client';

import { use, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { qrService } from '@/services/qr.service';
import { ScanService } from '@/services/scan.service';
import { LocationData } from '@/interfaces/location';
import { QrRedirectData } from '@/interfaces/qr';
import { PetInfo } from '@/components/qr/PetInfo';
import { UrlList } from '@/components/qr/UrlList';
import { QR_TYPES } from '@/constants/qrTypes';
import { AlertCircle } from 'lucide-react';

interface QrRedirectProps {
  params: {
    id: string;
  };
}

export default function QrRedirect({ params }: QrRedirectProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string>('Iniciando...');
  const [qrData, setQrData] = useState<QrRedirectData | null>(null);
  const [name, setName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const redirectUrlRef = useRef<string | null>(null);
  const hasExecutedRef = useRef(false);
  const [showContent, setShowContent] = useState(false);

  const handleRedirect = useCallback(() => {
    console.log(`redirectUrlRef.current: ${redirectUrlRef.current}`);

    if (redirectUrlRef.current) {
      window.location.href = redirectUrlRef.current;
    }
  }, []);

  const handleProcess = useCallback(async () => {
    let response: any = '';
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;

    // Obtener datos del localStorage
    let scanData = localStorage.getItem('data');
    let userIdScan, lastScanId;

    if (scanData) {
      const parsedData = JSON.parse(scanData);
      userIdScan = parsedData.userIdScan;
      lastScanId = parsedData.lastScanId;
    }

    // Si no existe userIdScan, crear uno nuevo
    if (!userIdScan) {
      userIdScan = crypto.randomUUID();
      localStorage.setItem('data', JSON.stringify({
        userIdScan,
        lastScanId: Date.now()
      }));
    }

    try {
      // 1. Obtener la URL de redirección y tipo de QR
      setStatus('Obteniendo información del QR...');
      response = await qrService.getPublicRedirectUrl(params.id);

      if (!response?.data) {
        throw new Error('No se pudo obtener la información del QR');
      }

      const { data, name } = response;
      setQrData(data);
      setName(name || null);
      console.info(`QR name: ${JSON.stringify(name)}`);
      // Determinar la URL de redirección según el tipo
      switch (data.typeQr) {
        case QR_TYPES.WHATSAPP:
          redirectUrlRef.current = data.whatsappUrl || null;
          break;
        case QR_TYPES.EMAIL:
          redirectUrlRef.current = data.emailUrl || null;
          break;
        case QR_TYPES.CALL:
          redirectUrlRef.current = data.phoneUrl || null;
          break;
        case QR_TYPES.WIFI:
        case QR_TYPES.TEXT:
        case QR_TYPES.PET:
        case QR_TYPES.URL_LIST:
        case QR_TYPES.VCARD:
          setShowContent(true);
          redirectUrlRef.current = null;
          break;
        case QR_TYPES.DYNAMIC:
        case QR_TYPES.URL:
        default:
          redirectUrlRef.current = data.url || null;
          break;
      }

      // 2. Obtener información de ubicación
      setStatus('Obteniendo ubicación...');
      let finalLocationData: LocationData = {
        latitude: null,
        longitude: null,
        country: 'No especificado',
        city: 'No especificado'
      };

      try {
        const browserLocation = await ScanService.getLocationFromBrowser();
        finalLocationData = browserLocation;
      } catch (geoError) {
        console.log('No se pudo obtener la ubicación del navegador, intentando con IP...');
        try {
          const ipInfo = await ScanService.getIpInfo();
          if (ipInfo.latitude && ipInfo.longitude) {
            finalLocationData = {
              latitude: ipInfo.latitude,
              longitude: ipInfo.longitude,
              country: ipInfo.country || 'No especificado',
              city: ipInfo.city || 'No especificado'
            };
          }
        } catch (ipError) {
          console.log('No se pudo obtener la ubicación por IP');
        }
      }

      // 3. Registrar estadísticas
      setStatus('Registrando visita...');
      try {
        const deviceInfo = await ScanService.getDeviceInfo();
        const ipInfo = await ScanService.getIpInfo();

        const scan = await ScanService.createScanStats({
          idQr: params.id,
          scanDate: new Date().toISOString(),
          location: finalLocationData,
          device: deviceInfo,
          ip: ipInfo.ip,
          referer: document.referrer || undefined,
          successful: true,
          userIdScan,
          lastScanId,
          userId: response.id
        });

        console.log('scan', JSON.stringify(scan));

        // Guardar el ID del nuevo escaneo
        if (scan?._id) {
          localStorage.setItem('data', JSON.stringify({
            userIdScan,
            lastScanId: scan._id
          }));
        }
      } catch (statsError) {
        console.error('Error al registrar estadísticas:', statsError);
        // Continuamos con la ejecución aunque falle el registro de estadísticas
      }

      // 4. Finalmente, redirigir si hay URL
      setStatus('Redirigiendo visita...');
      if (redirectUrlRef.current && !showContent) {
        handleRedirect();
      }

    } catch (error: any) {
      console.error('Error en el proceso:', error);
      setError(error?.message || 'Error al procesar el QR');
      setStatus('Error en el proceso');
      hasExecutedRef.current = false;

      // Registrar estadística de error si es posible
      try {
        const deviceInfo = await ScanService.getDeviceInfo();
        const ipInfo = await ScanService.getIpInfo();

        ScanService.createScanStats({
          idQr: params.id,
          scanDate: new Date().toISOString(),
          location: {
            latitude: null,
            longitude: null,
            country: 'No especificado',
            city: 'No especificado'
          },
          device: deviceInfo,
          ip: ipInfo.ip,
          referer: document.referrer || undefined,
          successful: false,
          error: error?.message,
          userIdScan,
          lastScanId,
          userId: response.id
        });
      } catch (statsError) {
        console.error('Error al registrar estadísticas de error:', statsError);
      }
    }
  }, [params.id, setStatus, setQrData, setName, setError, setShowContent, handleRedirect, showContent]);

  useEffect(() => {
    handleProcess();
  }, [handleProcess]);

  const renderContent = () => {
    if (!qrData) return null;

    switch (qrData.typeQr) {
      case QR_TYPES.PET:
        return qrData.petData ? (
          <PetInfo data={qrData.petData} />
        ) : null;
      case QR_TYPES.URL_LIST:
        return qrData.urlList ? (
          <div className="min-h-screen mt-10 mx-5 justify-center dark:bg-gray-900">
            <UrlList urls={qrData.urlList} nameData={name} />
          </div>
        ) : null;
      case QR_TYPES.WIFI:
        return qrData.wifiData ? (
          <div className="max-w-lg mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 dark:bg-gray-900">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800 dark:text-white">
              Información de WiFi
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Red</p>
                <p className="font-medium text-gray-800 dark:text-white">
                  {qrData.wifiData.ssid}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Contraseña</p>
                <p className="font-medium text-gray-800 dark:text-white">
                  {qrData.wifiData.password}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Seguridad</p>
                <p className="font-medium text-gray-800 dark:text-white">
                  {qrData.wifiData.security}
                </p>
              </div>
            </div>
          </div>
        ) : null;
      case QR_TYPES.TEXT:
        return qrData.text ? (
          <div className="max-w-lg mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800 dark:text-white">
              Mensaje
            </h2>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {qrData.text}
            </p>
          </div>
        ) : null;
      default:
        return null;
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
        <div className="text-center space-y-4 p-6 max-w-md mx-auto">
          <div className="flex justify-center">
            <AlertCircle className="h-12 w-12 text-primary-foreground" />
          </div>
          <h2 className="text-2xl font-semibold text-primary-foreground">
            Error al acceder al QR
          </h2>
          <p className="text-primary-foreground/80">{error}</p>
          <button
            onClick={() => {
              setError(null);
              hasExecutedRef.current = false;
              handleProcess();
            }}
            className="px-4 py-2 bg-primary-foreground text-primary rounded-md hover:bg-primary-foreground/90 transition-colors"
          >
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  if (showContent) {
    return renderContent();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">{status}</p>
      </div>
    </div>
  );
}