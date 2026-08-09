'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { qrService } from '@/services/qr.service';
import { ScanService, ScanStats } from '@/services/scan.service';
import { QrRedirectData, VCardData } from '@/interfaces/qr';
import { LocationData } from '@/interfaces/location';
import { PetInfo } from '@/components/qr/PetInfo';
import { UrlList } from '@/components/qr/UrlList';
import { QR_TYPES } from '@/constants/qrTypes';
import { AlertCircle } from 'lucide-react';
import Head from 'next/head';
import { safeLocalStorage } from '@/utils/browser';
import { generateVCardContent } from '@/utils/vcard';
import { GeolocationPrompt } from '@/components/qr/GeolocationPrompt';

// --- Componentes de UI (LoadingScreen, ErrorScreen, ContentLayout) ---
const LoadingScreen = ({ status }: { status: string }) => (
  <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
    <div className="text-center p-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500 mx-auto"></div>
      <p className="mt-4 text-gray-400">{status}</p>
    </div>
  </div>
);

const ErrorScreen = ({ error, onRetry }: { error: string; onRetry: () => void }) => (
  <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
    <div className="text-center space-y-4 p-6 max-w-md mx-auto">
      <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
      <h2 className="text-2xl font-semibold">Error al Cargar el QR</h2>
      <p className="text-gray-400">{error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors"
        aria-label="Intentar cargar el código QR de nuevo"
      >
        Intentar de nuevo
      </button>
    </div>
  </div>
);

const ContentLayout = ({ children, title }: { children: React.ReactNode; title: string }) => (
  <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 flex flex-col items-center">
    <div className="w-full max-w-lg">
      <h1 className="text-2xl font-bold text-center mb-6">{title}</h1>
      {children}
      <footer className="mt-10 text-center text-xs text-gray-400">
        Para crear tus propios códigos QR visita{' '}
        <a href="https://www.portaqr.cl/" target="_blank" rel="noopener noreferrer" className="text-accent-500 underline">
          PortaQr.cl
        </a>
      </footer>
    </div>
  </div>
);

interface QrRedirectProps {
  params: { id: string };
}

type PageState =
  | { status: 'loading'; message: string }
  | { status: 'prompting_geo'; qrResponse: { data: QrRedirectData; id: string; name?: string } }
  | { status: 'success'; data: QrRedirectData; name?: string }
  | { status: 'error'; message: string };


// --- Funciones de SEO ---
const getPageTitle = (state: PageState, params: { id: string }): string => {
  if (state.status === 'error') return 'Error - Porta QR';
  if (state.status === 'success') {
      const { data, name } = state;
      switch (data.typeQr) {
          case QR_TYPES.PET: return `Información de Mascota: ${data.petData?.petName || ''} | Porta QR`;
          case QR_TYPES.WIFI: return `Acceso WiFi: ${data.wifiData?.ssid || ''} | Porta QR`;
          case QR_TYPES.TEXT: return `Mensaje de ${name || 'Porta QR'}`;
          case QR_TYPES.VCARD: return `Contacto: ${data.vcardData?.fn || ''} | Porta QR`;
          case QR_TYPES.URL_LIST: return `Enlaces de ${name || 'Porta QR'}`;
          default: return name ? `${name} - Porta QR` : `Porta QR - ${params.id}`;
      }
  }
  return 'Redireccionando Código QR - Porta QR';
};

const getPageDescription = (state: PageState): string => {
  if (state.status === 'error') return 'Ocurrió un error al procesar este código QR.';
  if (state.status === 'success') {
      const { data } = state;
      switch (data.typeQr) {
          case QR_TYPES.PET: return `Conoce a ${data.petData?.petName || 'esta mascota'} y la información de contacto de su dueño.`;
          case QR_TYPES.WIFI: return `Escanea para conectarte a la red WiFi "${data.wifiData?.ssid || ''}".`;
          case QR_TYPES.TEXT: return 'Contenido de texto compartido a través de un código QR de Porta QR.';
          case QR_TYPES.VCARD: return `Guarda la información de contacto de ${data.vcardData?.fn || ''} directamente en tu agenda.`;
          case QR_TYPES.URL_LIST: return 'Accede a una lista de enlaces importantes compartidos a través de este código QR.';
          default: return 'Accediendo a contenido a través de un código QR gestionado por Porta QR.';
      }
  }
  return 'Procesando tu código QR. Por favor, espera un momento...';
};


export default function QrRedirect({ params }: QrRedirectProps) {
  const searchParams = useSearchParams();
  const hasExecutedRef = useRef(false);
  const [pageState, setPageState] = useState<PageState>({ status: 'loading', message: 'Iniciando...' });

  const proceedWithAction = (qrResponse: { data: QrRedirectData; name?: string }) => {
    const { data, name } = qrResponse;
    setPageState({ status: 'loading', message: 'Finalizando...' });

    switch (data.typeQr) {
      case QR_TYPES.WHATSAPP: window.location.href = data.whatsappUrl!; break;
      case QR_TYPES.EMAIL: window.location.href = data.emailUrl!; break;
      case QR_TYPES.CALL: window.location.href = data.phoneUrl!; break;
      case QR_TYPES.DYNAMIC: case QR_TYPES.URL: window.location.href = data.url!; break;
      case QR_TYPES.WIFI: case QR_TYPES.TEXT: case QR_TYPES.PET: case QR_TYPES.URL_LIST: case QR_TYPES.VCARD:
        setPageState({ status: 'success', data, name });
        break;
      default:
        setPageState({ status: 'error', message: 'Tipo de QR no reconocido.' });
    }
  };

  const collectAndRegisterScan = useCallback(async (
    qrResponse: { data: QrRedirectData; id: string; name?: string },
    useBrowserGeolocation: boolean
  ) => {
    setPageState({ status: 'loading', message: 'Analizando visita...' });

    let userIdScan = null, lastScanId = null;
    try {
      const storedData = JSON.parse(safeLocalStorage.getItem('data') || 'null');
      userIdScan = storedData?.userIdScan;
      lastScanId = storedData?.lastScanId;
    } catch {}
    if (!userIdScan) userIdScan = crypto.randomUUID();

    const [deviceInfo, ipInfo] = await Promise.all([ScanService.getDeviceInfo(), ScanService.getIpInfo()]);
    
    let finalLocationData: LocationData = { 
        latitude: null, 
        longitude: null, 
        country: ipInfo.country || 'No especificado', 
        city: ipInfo.city || 'No especificado' 
    };

    if (useBrowserGeolocation) {
      try {
        const browserLocation = await ScanService.getLocationFromBrowser();
        if (browserLocation.latitude !== null && browserLocation.longitude !== null) {
          const { latitude, longitude } = browserLocation;
          finalLocationData = { ...finalLocationData, latitude, longitude };
          const { country, city } = await ScanService.reverseGeocode(latitude, longitude);
          finalLocationData.country = country;
          finalLocationData.city = city;
        }
      } catch (e) {
        console.warn('Ubicación del navegador denegada o fallida. Usando IP como respaldo.');
        if (ipInfo.latitude && ipInfo.longitude) {
            finalLocationData.latitude = ipInfo.latitude;
            finalLocationData.longitude = ipInfo.longitude;
        }
      }
    } else {
        if (ipInfo.latitude && ipInfo.longitude) {
            finalLocationData.latitude = ipInfo.latitude;
            finalLocationData.longitude = ipInfo.longitude;
        }
    }

    try {
      const scanPayload: ScanStats = {
        idQr: params.id,
        scanDate: new Date().toISOString(),
        location: finalLocationData,
        device: deviceInfo,
        ip: ipInfo.ip,
        referer: document.referrer || undefined,
        successful: true,
        userIdScan,
        lastScanId: lastScanId || 'sin escaneo',
        userId: qrResponse.id,
        origen: searchParams?.get('origen') ?? undefined,
      };
      
      const scan = await ScanService.createScanStats(scanPayload);
      if (scan?._id) {
        safeLocalStorage.setItem('data', JSON.stringify({ userIdScan, lastScanId: scan._id }));
      }
    } catch (statsError) {
      console.error('Error al registrar las estadísticas:', statsError);
    }

    proceedWithAction(qrResponse);

  }, [params.id, searchParams ?? {}]);


  useEffect(() => {
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;
    const initialFetch = async () => {
      try {
        setPageState({ status: 'loading', message: 'Obteniendo información del QR...' });
        const response = await qrService.getPublicRedirectUrl(params.id);
        if (!response?.data) {
          throw new Error('No se pudo obtener la información del QR (código inválido o inactivo).');
        }
        setPageState({ status: 'prompting_geo', qrResponse: response });
      } catch (err: any) {
        setPageState({ status: 'error', message: err.message || 'Ocurrió un error inesperado.' });
      }
    };
    initialFetch();
  }, [params.id, collectAndRegisterScan]);
  
  const renderContent = (qrData: QrRedirectData, name?: string) => {
    switch (qrData.typeQr) {
      case QR_TYPES.PET:
        return <PetInfo data={qrData.petData!} />;
      case QR_TYPES.URL_LIST:
        return <UrlList urls={qrData.urlList} nameData={name} />;
      case QR_TYPES.WIFI:
        return (
          <ContentLayout title="Información de WiFi">
            <div className="space-y-4 text-left bg-gray-800 p-6 rounded-lg">
              <div><p className="text-sm text-gray-400">Red (SSID)</p><p className="font-medium text-lg">{qrData.wifiData!.ssid}</p></div>
              <div><p className="text-sm text-gray-400">Contraseña</p><p className="font-medium text-lg">{qrData.wifiData!.password}</p></div>
              <div><p className="text-sm text-gray-400">Seguridad</p><p className="font-medium text-lg">{qrData.wifiData!.security}</p></div>
            </div>
          </ContentLayout>
        );
      case QR_TYPES.TEXT:
        return (
          <ContentLayout title="Mensaje">
             <div className="bg-gray-800 p-6 rounded-lg">
                <p className="whitespace-pre-wrap text-left text-gray-300">{qrData.text}</p>
             </div>
          </ContentLayout>
        );
      case QR_TYPES.VCARD:
        return (
          <ContentLayout title="Tarjeta de Contacto">
            <div className="bg-gray-800 p-6 rounded-lg">
                <div className="text-center mb-4">
                    <p className="text-xl font-bold">{qrData.vcardData?.fn}</p>
                    <p className="text-gray-400">{qrData.vcardData?.title}</p>
                </div>
                <button
                onClick={() => {
                    const vcfContent = generateVCardContent(qrData.vcardData!);
                    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `${qrData.vcardData!.fn || 'contacto'}.vcf`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }}
                className="w-full px-4 py-3 bg-accent-500 text-white rounded-md hover:bg-accent-600 transition-colors font-semibold"
                >
                Descargar Contacto (.vcf)
                </button>
            </div>
          </ContentLayout>
        );
      default:
        return <ErrorScreen error="Tipo de contenido no renderizable." onRetry={() => window.location.reload()} />;
    }
  };
  
  const title = getPageTitle(pageState, params);
  const description = getPageDescription(pageState);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={`https://www.portaqr.cl/qr/${params.id}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://www.portaqr.cl/qr/${params.id}`} />
        <meta property="og:image" content="https://www.portaqr.cl/Logo_PortaQR_Horizontal_blanco.svg" />
        <meta property="og:site_name" content="Porta QR" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content="https://www.portaqr.cl/Logo_PortaQR_Horizontal_blanco.svg" />
      </Head>

      {(() => {
        switch (pageState.status) {
          case 'loading':
            return <LoadingScreen status={pageState.message} />;
          case 'error':
            return <ErrorScreen error={pageState.message} onRetry={() => { hasExecutedRef.current = false; window.location.reload(); }} />;
          case 'prompting_geo':
            return (
              <>
                <LoadingScreen status="Esperando confirmación..." />
                <GeolocationPrompt 
                    isOpen={true}
                    onAllow={() => collectAndRegisterScan(pageState.qrResponse, true)}
                    onDeny={() => collectAndRegisterScan(pageState.qrResponse, false)}
                />
              </>
            );
          case 'success':
            return renderContent(pageState.data, pageState.name);
          default:
            return <LoadingScreen status="Inicializando..." />;
        }
      })()}
    </>
  );
}