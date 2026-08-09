'use client'

import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import Link from 'next/link'
import Head from 'next/head';

const sections = [
  {
    id: 'introduccion',
    title: 'Introducción',
    content: [
      'Estos Términos de Servicio ("Términos") rigen el uso de Porta QR ("el Servicio"). Al utilizar el Servicio, usted acepta estos términos en su totalidad. Si no está de acuerdo con parte o la totalidad de estos términos, no utilice el Servicio.',
      'Porta QR se reserva el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor inmediatamente después de su publicación en el Servicio. El uso continuado del Servicio después de dichos cambios constituye su aceptación de los nuevos términos.'
    ]
  },
  {
    id: 'cuenta',
    title: 'Cuenta y Registro',
    content: [
      'Para utilizar ciertas funciones del Servicio, debe registrarse y crear una cuenta. Usted es responsable de:',
      '• Mantener la confidencialidad de su contraseña',
      '• Restringir el acceso a su cuenta',
      '• Todas las actividades que ocurran bajo su cuenta',
      'Debe notificarnos inmediatamente cualquier uso no autorizado de su cuenta o cualquier otra violación de seguridad.'
    ]
  },
  {
    id: 'uso',
    title: 'Uso Aceptable',
    content: [
      'Al utilizar nuestro Servicio, usted acepta no:',
      '• Violar leyes o regulaciones aplicables',
      '• Infringir derechos de propiedad intelectual',
      '• Transmitir material ilegal, abusivo o spam',
      '• Interferir con el funcionamiento del Servicio',
      '• Intentar acceder a áreas restringidas del Servicio',
      'Nos reservamos el derecho de suspender o terminar su acceso al Servicio por cualquier violación de estas reglas.'
    ]
  },
  {
    id: 'contenido',
    title: 'Contenido del Usuario',
    content: [
      'Al subir contenido al Servicio, usted:',
      '• Mantiene todos sus derechos de propiedad intelectual',
      '• Nos otorga una licencia mundial, no exclusiva y libre de regalías',
      '• Garantiza que tiene todos los derechos necesarios',
      '• Es responsable de todo el contenido que sube',
      'Nos reservamos el derecho de eliminar cualquier contenido que viole estos términos.'
    ]
  },
  {
    id: 'privacidad',
    title: 'Privacidad y Datos',
    content: [
      'La recopilación y uso de sus datos personales se rige por nuestra Política de Privacidad. Al usar el Servicio, usted acepta:',
      '• La recopilación y uso de información según nuestra política',
      '• El almacenamiento y procesamiento de datos en servidores seguros',
      '• El uso de cookies y tecnologías similares',
      'Para más información, consulte nuestra Política de Privacidad.'
    ]
  },
  {
    id: 'pagos',
    title: 'Pagos y Facturación',
    content: [
      'Para planes de pago:',
      '• Los pagos se realizan por adelantado',
      '• Las suscripciones se renuevan automáticamente',
      '• Puede cancelar en cualquier momento',
      '• No hay reembolsos por períodos parciales',
      'Los precios pueden cambiar con notificación previa de 30 días.'
    ]
  },
  {
    id: 'terminacion',
    title: 'Terminación',
    content: [
      'Podemos terminar o suspender su acceso al Servicio:',
      '• Por violaciones a estos términos',
      '• Por actividades fraudulentas',
      '• Por falta de pago',
      '• A nuestra discreción razonable',
      'Usted puede terminar su cuenta en cualquier momento.'
    ]
  },
  {
    id: 'limitaciones',
    title: 'Limitaciones de Responsabilidad',
    content: [
      'El Servicio se proporciona "tal cual" y "según disponibilidad". No garantizamos:',
      '• Disponibilidad ininterrumpida del Servicio',
      '• Ausencia de errores o defectos',
      '• Seguridad absoluta de los datos',
      'No seremos responsables por daños indirectos, incidentales o consecuentes.'
    ]
  }
]

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Términos de Servicio - Porta QR</title>
        <meta name="description" content="Conoce los términos y condiciones que rigen el uso de Porta QR. Información sobre cuentas, uso aceptable, contenido de usuario y más." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Header />
      <main className="min-h-screen bg-light-secondary dark:bg-dark-secondary">
        {/* Hero Section */}
        <section className="bg-light-primary dark:bg-dark-primary py-16 px-4 mt-[50px]" aria-labelledby="terms-hero-heading">
          <div className="max-w-7xl mx-auto text-center">
            <h1 id="terms-hero-heading" className="text-4xl md:text-5xl font-bold text-light-primary dark:text-dark-primary mb-4">
              Términos de Servicio
            </h1>
            <p className="text-xl text-light-secondary dark:text-dark-secondary max-w-2xl mx-auto">
              Última actualización: 15 de Marzo, 2024
            </p>
          </div>
        </section>

        {/* Navigation */}
        <nav className="sticky top-0 bg-white dark:bg-dark-primary border-b border-slate-200 dark:border-slate-800/60 py-4 px-4 z-10" aria-label="Navegación de secciones de términos de servicio">
          <div className="max-w-7xl mx-auto">
            <div className="overflow-x-auto">
              <div className="flex space-x-6 min-w-max">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="text-light-secondary dark:text-dark-secondary hover:text-accent-500 dark:hover:text-accent-400 text-sm font-medium"
                  >
                    {section.title}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </nav>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="bg-white dark:bg-dark-primary rounded-xl shadow-md p-8">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="mb-12 last:mb-0 scroll-mt-24"
                aria-labelledby={`${section.id}-heading`}
              >
                <h2 id={`${section.id}-heading`} className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-6">
                  {section.title}
                </h2>
                <div className="space-y-4">
                  {section.content.map((paragraph, index) => (
                    <p
                      key={index}
                      className="text-light-secondary dark:text-dark-secondary"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            {/* Contact Section */}
            <section className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800/60" aria-labelledby="contact-section-heading">
              <h2 id="contact-section-heading" className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-4">
                Contacto
              </h2>
              <p className="text-light-secondary dark:text-dark-secondary mb-4">
                Si tiene preguntas sobre estos Términos de Servicio, puede contactarnos:
              </p>
              <ul className="list-disc list-inside text-light-secondary dark:text-dark-secondary space-y-2">
                <li>Por correo electrónico: <a href="mailto:legal@qrsystem.com" className="text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-500" aria-label="Enviar correo electrónico a legal@qrsystem.com">legal@qrsystem.com</a></li>
                <li>A través de nuestro <Link href="/contacto" className="text-accent-500 hover:text-accent-600 dark:text-accent-400 dark:hover:text-accent-500" aria-label="Ir al formulario de contacto">formulario de contacto</Link></li>
                <li>Por correo postal: [Dirección de la empresa]</li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
} 