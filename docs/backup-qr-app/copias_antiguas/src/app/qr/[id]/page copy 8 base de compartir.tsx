'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { qrService } from '@/services/qr.service';
import { ScanStats } from '@/services/scan.service';
import { ScanService } from '@/services/scan.service';
import { LocationData } from '@/interfaces/location';
import { QrRedirectData } from '@/interfaces/qr';
import { PetInfo } from '@/components/qr/PetInfo';
import { VCardData } from '@/components/qr/types';
import Head from 'next/head';
import ShareModal from '@/components/ShareModal';

const generateVCardContent = (data: VCardData): string => {
  let vcard = 'BEGIN:VCARD\nVERSION:3.0\n';

  if (data.n?.firstName || data.n?.lastName) {
    vcard += `N:${data.n?.lastName || ''};${data.n?.firstName || ''};;\n`;
    vcard += `FN:${data.fn || ''}\n`;
  }
  if (data.org) vcard += `ORG:${data.org}\n`;
  if (data.title) vcard += `TITLE:${data.title}\n`;
  if (data.role) vcard += `ROLE:${data.role}\n`;
    data.urls?.forEach(url => {
    if (url) vcard += `URL:${url}\n`;
  });
  if (data.photo) vcard += `PHOTO;VALUE=URL:${data.photo}\n`;
  if (data.logo) vcard += `LOGO;VALUE=URL:${data.logo}\n`;
  if (data.note) vcard += `NOTE:${data.note}\n`;
  if (data.bday) vcard += `BDAY:${data.bday}\n`;
  if (data.anniversary) vcard += `ANNIVERSARY:${data.anniversary}\n`;
  if (data.gender) vcard += `GENDER:${data.gender}\n`;
  if (data.nickname) vcard += `NICKNAME:${data.nickname}\n`;

  data.emails?.forEach(email => {
    if (email.value) vcard += `EMAIL;TYPE=${email.type.toUpperCase()}:${email.value}\n`;
  });

  data.phones?.forEach(phone => {
    if (phone.value) vcard += `TEL;TYPE=${phone.type.toUpperCase()}:${phone.value}\n`;
  });

  data.addresses?.forEach(address => {
    if (address.street || address.city || address.region || address.postalCode || address.country) {
      vcard += `ADR;TYPE=${address.type.toUpperCase()}:;;${address.street};${address.city};${address.region};${address.postalCode};${address.country}\n`;
    }
  });

  vcard += 'END:VCARD';
  return vcard;
};
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
  const searchParams = useSearchParams();
  const origen = searchParams?.get('origen') || null;
  const [status, setStatus] = useState<string>('Iniciando...');
  const [qrData, setQrData] = useState<QrRedirectData | null>(null);
  const [name, setName] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const redirectUrlRef = useRef<string | null>(null);
  const hasExecutedRef = useRef(false);
  const [showContent, setShowContent] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const handleRedirect = useCallback(() => {
    // console.log(`redirectUrlRef.current: ${redirectUrlRef.current}`);

    if (redirectUrlRef.current) {
      window.location.href = redirectUrlRef.current;
    }
  }, []);

  const handleProcess = useCallback(async () => {
    let response: any = '';
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;

    let userIdScan: string | null = null;
    let lastScanId: string | number | null = null;

    const scanData = localStorage.getItem('data');
    if (scanData && typeof scanData === 'string') {
      try {
        const parsedData = JSON.parse(scanData);
        userIdScan = parsedData.userIdScan;
        lastScanId = parsedData.lastScanId;
      } catch (e) {
        console.error('Error al parsear datos de localStorage, eliminando datos corruptos:', e);
        localStorage.removeItem('data');
      }
    }

    if (!userIdScan) {
      userIdScan = crypto.randomUUID();
      localStorage.setItem(
        'data',
        JSON.stringify({
          userIdScan,
          lastScanId: null,
        })
      );
    }

    try {
      setStatus('Obteniendo información del QR...');
      const response = await qrService.getPublicRedirectUrl(params.id);
      const { data } = response;
      redirectUrlRef.current = data.url || null;

      if (!response?.data) {
        throw new Error('No se pudo obtener la información del QR');
      }

      const qrData = response.data;
      setQrData(qrData);
      const qrName = qrData.name || undefined;
      setName(qrName);
      console.info(`QR name: ${JSON.stringify(qrName)}`);

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

      // --- 2. Obtener información de ubicación (PRIORIZANDO navigator.geolocation) ---
      setStatus('Obteniendo ubicación...');
      let finalLocationData: LocationData = {
        latitude: null,
        longitude: null,
        country: 'No especificado',
        city: 'No especificado',
      };

      try {
        const browserLocation = await ScanService.getLocationFromBrowser();

        if (browserLocation.latitude !== null && browserLocation.longitude !== null) {
          finalLocationData.latitude = browserLocation.latitude;
          finalLocationData.longitude = browserLocation.longitude;
          console.log('[handleProcess] Coordenadas del navegador obtenidas. Intentando geocodificación inversa...');

          try {
            // *** AQUÍ ESTÁ EL CAMBIO: LLAMANDO A ScanService.reverseGeocode ***
            const { country, city } = await ScanService.reverseGeocode(
              browserLocation.latitude,
              browserLocation.longitude
            );
            finalLocationData.country = country;
            finalLocationData.city = city;
            console.log(`[handleProcess] Ubicación geocodificada: País ${country}, Ciudad ${city}`);
          } catch (geoCodeError) {
            console.warn('[handleProcess] Error al geocodificar coordenadas del navegador:', geoCodeError);
            // Si la geocodificación inversa falla, mantenemos lat/lon y país/ciudad como 'No especificado'
          }
        } else {
          console.log('[handleProcess] Ubicación del navegador no disponible o nula. Intentando con IP...');
          const ipInfo = await ScanService.getIpInfo();
          if (ipInfo.latitude && ipInfo.longitude) {
            finalLocationData = {
              latitude: ipInfo.latitude,
              longitude: ipInfo.longitude,
              country: ipInfo.country || 'No especificado',
              city: ipInfo.city || 'No especificado',
            };
            console.log('[handleProcess] Ubicación obtenida por IP.');
          } else {
            console.log('[handleProcess] No se pudo obtener ubicación válida ni del navegador ni por IP.');
          }
        }
      } catch (geoError: any) {
        console.warn('[handleProcess] Error al obtener ubicación del navegador, intentando con IP:', geoError.message);
        try {
          const ipInfo = await ScanService.getIpInfo();
          if (ipInfo.latitude && ipInfo.longitude) {
            finalLocationData = {
              latitude: ipInfo.latitude,
              longitude: ipInfo.longitude,
              country: ipInfo.country || 'No especificado',
              city: ipInfo.city || 'No especificado',
            };
            console.log('[handleProcess] Ubicación obtenida por IP después de error del navegador.');
          } else {
            console.log('[handleProcess] No se pudo obtener ubicación válida por IP.');
          }
        } catch (ipError) {
          console.error('[handleProcess] Error al obtener la ubicación por IP:', ipError);
        }
      }

      // --- 3. Registrar estadísticas de escaneo ---
      setStatus('Registrando visita...');
      try {
        const deviceInfo = await ScanService.getDeviceInfo();
        const currentIpInfo = await ScanService.getIpInfo();

        const scanData: ScanStats = {
          idQr: params.id,
          scanDate: new Date().toISOString(),
          location: finalLocationData,
          device: deviceInfo,
          ip: currentIpInfo.ip,
          referer: document.referrer || undefined,
          successful: true,
          userIdScan,
          lastScanId: lastScanId ? String(lastScanId) : 'sin escaneo',
          userId: response.id,
          origen: origen || undefined
        }
        console.log("ScanStats :",scanData);
        
        const scan = await ScanService.createScanStats(scanData);

        console.log('[handleProcess] Estadísticas de escaneo registradas:', JSON.stringify(scan));

        if (scan?._id) {
          localStorage.setItem(
            'data',
            JSON.stringify({
              userIdScan,
              lastScanId: scan._id,
            })
          );
        }
      } catch (statsError) {
        console.error('[handleProcess] Error al registrar estadísticas:', statsError);
      }

      // --- 4. Finalmente, redirigir si hay URL y no se muestra contenido en la página ---
      setStatus('Redirigiendo visita...');
      if (redirectUrlRef.current && !showContent) {
        handleRedirect();
      } else if (showContent) {
        setStatus('Contenido cargado.');
      } else {
        setStatus('Proceso completado. No hay redirección.');
      }
    } catch (error: any) {
      console.error('[handleProcess] Error en el proceso general:', error);
      setError(error?.message || 'Error al procesar el QR');
      setStatus('Error en el proceso');
      hasExecutedRef.current = false;

      try {
        const deviceInfo = await ScanService.getDeviceInfo();
        const ipInfoOnError = await ScanService.getIpInfo();

        await ScanService.createScanStats({
          idQr: params.id,
          scanDate: new Date().toISOString(),
          location: {
            latitude: null,
            longitude: null,
            country: 'No especificado',
            city: 'No especificado',
          },
          device: deviceInfo,
          ip: ipInfoOnError.ip,
          referer: document.referrer || undefined,
          successful: false,
          error: error?.message,
          userIdScan,
          lastScanId,
          userId: response?.id,
        });
      } catch (statsError) {
        console.error('[handleProcess] Error al registrar estadísticas de error:', statsError);
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
          <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen dark:bg-gray-900">
            <PetInfo data={qrData.petData} />
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="w-full max-w-xs px-4 py-2 mt-4 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Compartir QR
            </button>
            <ShareModal
              isOpen={isShareModalOpen}
              onClose={() => setIsShareModalOpen(false)}
              shareUrl={window.location.href}
              title={qrData.name || 'QR Code'}
            />
          </div>
        ) : null;
      case QR_TYPES.URL_LIST:
        return qrData.urlList ? (
          <div className="h-screen supports-[height:100dvh]:h-dvh justify-center dark:bg-gray-900 h-dvh supports-[height:100dvh]:h-dvh">
            <UrlList urls={qrData.urlList} nameData={name} />
          </div>
        ) : null;
      case QR_TYPES.WIFI:
        return qrData.wifiData ? (
          <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen dark:bg-gray-900">
            <div className="max-w-lg rounded-lg shadow-lg p-6" aria-labelledby="wifi-info-heading">
              <h2 id="wifi-info-heading" className="text-2xl font-bold text-center mb-6 text-gray-800 dark:text-white">
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
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="w-full max-w-xs px-4 py-2 mt-4 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Compartir QR
            </button>
            <ShareModal
              isOpen={isShareModalOpen}
              onClose={() => setIsShareModalOpen(false)}
              shareUrl={window.location.href}
              title={qrData.name || 'QR Code'}
            />
          </div>
        ) : null;
      case QR_TYPES.TEXT:
        return qrData.text ? (
          <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen dark:bg-gray-900">
            <div className="max-w-lg rounded-lg shadow-lg p-6" aria-labelledby="text-message-heading">
              <h2 id="text-message-heading" className="text-2xl font-bold text-center mb-6 text-gray-800 dark:text-white">
                Mensaje
              </h2>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {qrData.text}
              </p>
            </div>
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="w-full max-w-xs px-4 py-2 mt-4 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Compartir QR
            </button>
            <ShareModal
              isOpen={isShareModalOpen}
              onClose={() => setIsShareModalOpen(false)}
              shareUrl={window.location.href}
              title={qrData.name || 'QR Code'}
            />
          </div>
        ) : null;
      case QR_TYPES.VCARD:
        return qrData.vcardData ? (
          <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen dark:bg-gray-900">
            <div className="max-w-lg rounded-lg shadow-lg p-6" aria-labelledby="contact-info-heading">
              <h2 id="contact-info-heading" className="text-2xl font-bold text-center mb-6 text-gray-800 dark:text-white">
                Información de Contacto
              </h2>
              <button
                onClick={() => {
                  if (qrData.vcardData) {
                    const vcfContent = generateVCardContent(qrData.vcardData);
                    console.log("qrData.vcardData:", qrData.vcardData);
                    const encodedVCF = encodeURIComponent(vcfContent);
                    const dataUrl = `data:text/vcard;charset=utf-8,${encodedVCF}`;
                    const link = document.createElement('a');
                    link.href = dataUrl;
                    link.setAttribute('download', `${qrData.vcardData.fn || 'contacto'}.vcf`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Descargar Tarjeta de contacto
              </button>
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="w-full px-4 py-2 mt-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Compartir QR
              </button>
              <p className="m-4 mb-10 text-xs text-gray-400">Para crear tus QRs visita <a href="https://www.portaqr.cl/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">PortaQr.cl</a>.</p>
            </div>
            <ShareModal
              isOpen={isShareModalOpen}
              onClose={() => setIsShareModalOpen(false)}
              shareUrl={window.location.href}
              title={qrData.name || 'QR Code'}
            />
          </div>
        ) : null;
      default:
        return null;
    }
  };

  if (error) {
    return (
      <div className="h-svh w-screen justify-center dark:bg-gray-900">
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
            aria-label="Intentar cargar el código QR de nuevo"
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
    <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-screen dark:bg-gray-900">
      <div className="text-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500 mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">{status}</p>
      </div>
    </div>
  );
}