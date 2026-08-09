'use client';

import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

const cookieTypes = [
  {
    title: 'Cookies Necesarias',
    content: [
      'Son esenciales para el funcionamiento básico del sitio web:',
      '• Mantener su sesión activa',
      '• Recordar sus preferencias de privacidad',
      '• Garantizar la seguridad del sitio',
      '• Permitir funciones básicas como la navegación',
      'Estas cookies no pueden ser desactivadas ya que son necesarias para el funcionamiento del sitio.'
    ]
  },
  {
    title: 'Cookies de Rendimiento',
    content: [
      'Nos ayudan a entender cómo interactúan los visitantes con nuestro sitio:',
      '• Analizar el tráfico del sitio',
      '• Identificar qué páginas son más populares',
      '• Ver cómo navegan los usuarios',
      '• Detectar y resolver problemas técnicos',
      'Estas cookies son opcionales y puede elegir desactivarlas.'
    ]
  },
  {
    title: 'Cookies de Funcionalidad',
    content: [ 
      'Permiten funciones avanzadas y personalización:',
      '• Recordar su nombre de usuario',
      '• Guardar sus preferencias de idioma',
      '• Personalizar el contenido según su ubicación',
      '• Mantener sus preferencias de visualización',
      'Puede desactivar estas cookies, pero algunas funciones del sitio podrían no estar disponibles.'
    ]
  },
  {
    title: 'Cookies de Marketing',
    content: [
      'Se utilizan para mostrar publicidad relevante:',
      '• Mostrar anuncios personalizados',
      '• Medir la efectividad de las campañas',
      '• Evitar mostrar anuncios repetitivos',
      '• Compartir información con anunciantes',
      'Estas cookies son completamente opcionales y puede elegir no permitirlas.'
    ]
  }
]

const cookieManagement = [
  {
    title: 'Gestión de Cookies',
    content: [
      'Puede gestionar sus preferencias de cookies de varias formas:',
      '• A través de nuestro panel de preferencias de cookies',
      '• Mediante la configuración de su navegador',
      '• Utilizando herramientas de terceros',
      'Tenga en cuenta que bloquear ciertos tipos de cookies puede afectar su experiencia en el sitio.'
    ]
  },
  {
    title: 'Duración de las Cookies',
    content: [
      'Las cookies que utilizamos tienen diferentes duraciones:',
      '• Cookies de sesión: se eliminan al cerrar el navegador',
      '• Cookies persistentes: permanecen por un tiempo determinado',
      '• Cookies de terceros: varían según el proveedor',
      'Revisamos regularmente nuestras cookies y actualizamos nuestra política según sea necesario.'
    ]
  }
]

export default function CookiesPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-light-secondary dark:bg-dark-secondary ">
        {/* Hero Section */}
        <section className="bg-light-primary dark:bg-dark-primary py-16 px-4 mt-[50px]">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-light-primary dark:text-dark-primary mb-4">
              Política de Cookies
            </h1>
            <p className="text-xl text-light-secondary dark:text-dark-secondary max-w-2xl mx-auto">
              Entendemos la importancia de su privacidad. Esta política explica cómo utilizamos las cookies y tecnologías similares.
            </p>
          </div>
        </section>

        {/* Content Section */}
        <section className="py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-dark-primary rounded-xl shadow-md p-8">
              <p className="text-light-secondary dark:text-dark-secondary mb-8">
                Última actualización: 15 de Marzo, 2024
              </p>

              <div className="mb-12">
                <h2 className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-4">
                  ¿Qué son las cookies?
                </h2>
                <p className="text-light-secondary dark:text-dark-secondary">
                  Las cookies son pequeños archivos de texto que los sitios web colocan en su dispositivo para almacenar información sobre sus preferencias, mejorar su experiencia y ayudar a los sitios a funcionar de manera más eficiente.
                </p>
              </div>

              {/* Tipos de Cookies */}
              <div className="mb-12">
                <h2 className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-6">
                  Tipos de Cookies que Utilizamos
                </h2>
                <div className="grid gap-8">
                  {cookieTypes.map((type, index) => (
                    <div
                      key={index}
                      className="bg-light-secondary dark:bg-dark-secondary rounded-lg p-6"
                    >
                      <h3 className="text-xl font-semibold text-light-primary dark:text-dark-primary mb-4">
                        {type.title}
                      </h3>
                      <div className="space-y-3">
                        {type.content.map((paragraph, pIndex) => (
                          <p
                            key={pIndex}
                            className="text-light-secondary dark:text-dark-secondary"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gestión de Cookies */}
              {cookieManagement.map((section, index) => (
                <div key={index} className="mb-12 last:mb-0">
                  <h2 className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-4">
                    {section.title}
                  </h2>
                  <div className="space-y-3">
                    {section.content.map((paragraph, pIndex) => (
                      <p
                        key={pIndex}
                        className="text-light-secondary dark:text-dark-secondary"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              ))}

              {/* Contacto Section */}
              <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800/60">
                <h2 className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-4">
                  Más Información
                </h2>
                <p className="text-light-secondary dark:text-dark-secondary mb-4">
                  Si tiene preguntas sobre nuestra política de cookies, puede:
                </p>
                <ul className="list-disc list-inside text-light-secondary dark:text-dark-secondary space-y-2">
                  <li>Consultar nuestra <a href="/privacidad" className="text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-500">Política de Privacidad</a></li>
                  <li>Contactarnos a través de nuestro <a href="/contacto" className="text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-500">formulario de contacto</a></li>
                  <li>Enviarnos un email a privacy@qrsystem.com</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
} 