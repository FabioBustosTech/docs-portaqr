'use client';

import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

const sections = [
  {
    title: 'Recopilación de Información',
    content: [
      'Recopilamos información cuando usted:',
      '• Se registra en nuestra plataforma',
      '• Crea códigos QR',
      '• Utiliza nuestros servicios',
      '• Se suscribe a nuestro boletín',
      'La información puede incluir su nombre, correo electrónico, empresa y datos de uso del servicio.'
    ]
  },
  {
    title: 'Uso de la Información',
    content: [
      'Utilizamos la información recopilada para:',
      '• Personalizar su experiencia',
      '• Mejorar nuestros servicios',
      '• Procesar transacciones',
      '• Enviar correos electrónicos periódicos',
      '• Proporcionar soporte técnico'
    ]
  },
  {
    title: 'Protección de la Información',
    content: [
      'Implementamos diversas medidas de seguridad para mantener la seguridad de su información personal:',
      '• Encriptación SSL',
      '• Acceso restringido a datos sensibles',
      '• Monitoreo regular de seguridad',
      '• Copias de seguridad cifradas',
      '• Actualizaciones de seguridad periódicas'
    ]
  },
  {
    title: 'Cookies',
    content: [
      'Utilizamos cookies para:',
      '• Entender sus preferencias',
      '• Mantener su sesión activa',
      '• Analizar el tráfico del sitio',
      '• Mejorar nuestro sitio web',
      'Puede elegir desactivar las cookies en su navegador, pero esto podría afectar la funcionalidad del sitio.'
    ]
  },
  {
    title: 'Divulgación a Terceros',
    content: [
      'No vendemos, intercambiamos ni transferimos su información personal a terceros. Esto no incluye terceros de confianza que nos ayudan a:',
      '• Operar nuestro sitio web',
      '• Conducir nuestro negocio',
      '• Brindar servicio',
      'siempre que estos terceros acuerden mantener la confidencialidad de la información.'
    ]
  },
  {
    title: 'Derechos del Usuario',
    content: [
      'Usted tiene derecho a:',
      '• Acceder a sus datos personales',
      '• Rectificar sus datos',
      '• Solicitar la eliminación de sus datos',
      '• Oponerse al procesamiento de sus datos',
      '• Portabilidad de datos',
      'Para ejercer estos derechos, contáctenos a través de nuestro formulario de contacto.'
    ]
  }
]

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-light-secondary dark:bg-dark-secondary">
        {/* Hero Section */}
        <section className="bg-light-primary dark:bg-dark-primary py-16 px-4 mt-[50px]">
          <div className="max-w-7xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-light-primary dark:text-dark-primary mb-4">
              Política de Privacidad
            </h1>
            <p className="text-xl text-light-secondary dark:text-dark-secondary max-w-2xl mx-auto">
              Su privacidad es importante para nosotros. Esta política describe cómo manejamos y protegemos su información.
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

              {sections.map((section, index) => (
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

              <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800/60">
                <h2 className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-4">
                  Contacto
                </h2>
                <p className="text-light-secondary dark:text-dark-secondary mb-4">
                  Si tiene alguna pregunta sobre esta Política de Privacidad, puede contactarnos:
                </p>
                <ul className="list-disc list-inside text-light-secondary dark:text-dark-secondary space-y-2">
                  <li>Por correo electrónico: privacy@qrsystem.com</li>
                  <li>A través de nuestro formulario de contacto</li>
                  <li>Por teléfono: +34 900 123 456</li>
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