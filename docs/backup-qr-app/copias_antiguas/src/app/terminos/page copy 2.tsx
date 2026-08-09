'use client'

import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import Link from 'next/link'
import Head from 'next/head';

// MEJORA: Estructura de datos mejorada para manejar párrafos y listas semánticamente.
const sections = [
  {
    id: 'introduccion',
    title: '1. Introducción',
    content: [
      'Bienvenido a Porta QR. Estos Términos de Servicio ("Términos") rigen el uso de nuestra plataforma y servicios ("el Servicio"). Al acceder o utilizar el Servicio, usted acepta cumplir y estar sujeto a estos términos en su totalidad. Si no está de acuerdo, no debe utilizar el Servicio.',
      'Porta QR se reserva el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor inmediatamente después de su publicación. Su uso continuado del Servicio después de dichos cambios constituye su aceptación de los nuevos términos.'
    ]
  },
  {
    id: 'cuenta',
    title: '2. Cuenta y Registro',
    content: [
      'Para utilizar ciertas funciones del Servicio, debe registrarse y crear una cuenta. Usted es el único responsable de:',
      {
        list: [
          'Mantener la confidencialidad de su contraseña y credenciales de acceso.',
          'Restringir el acceso a su dispositivo y su cuenta.',
          'Todas las actividades que ocurran bajo su cuenta o contraseña.'
        ]
      },
      'Debe notificarnos inmediatamente sobre cualquier uso no autorizado de su cuenta o cualquier otra violación de seguridad.'
    ]
  },
  {
    id: 'uso',
    title: '3. Uso Aceptable',
    content: [
      'Al utilizar nuestro Servicio, usted se compromete a no utilizarlo para fines ilícitos o prohibidos por estos Términos. Usted acepta no:',
      {
        list: [
          'Violar ninguna ley local, nacional o internacional aplicable.',
          'Infringir los derechos de propiedad intelectual de terceros.',
          'Transmitir material que sea ilegal, abusivo, difamatorio, o que constituya spam.',
          'Interferir o interrumpir el funcionamiento normal del Servicio.',
          'Intentar obtener acceso no autorizado a áreas restringidas del Servicio.'
        ]
      },
      'Nos reservamos el derecho de suspender o terminar su acceso al Servicio por cualquier violación de estas reglas.'
    ]
  },
  {
    id: 'contenido',
    title: '4. Contenido del Usuario',
    content: [
      'Usted es el propietario y responsable de todo el contenido que sube o crea a través del Servicio. Al proporcionar contenido, usted:',
       {
        list: [
            'Mantiene todos sus derechos de propiedad sobre dicho contenido.',
            'Nos otorga una licencia mundial, no exclusiva y libre de regalías para usar, reproducir y mostrar el contenido con el fin de operar y proveer el Servicio.',
            'Garantiza que tiene todos los derechos, licencias y consentimientos necesarios para subir el contenido.',
        ]
      },
      'Nos reservamos el derecho, pero no la obligación, de revisar y eliminar cualquier contenido que viole estos términos.'
    ]
  },
  {
    id: 'privacidad',
    title: '5. Privacidad y Datos',
    content: [
      'Nuestra recopilación y uso de su información personal se rige por nuestra Política de Privacidad. Al usar el Servicio, usted consiente:',
      {
        list: [
            'La recopilación y uso de su información de acuerdo con dicha política.',
            'El almacenamiento y procesamiento de sus datos en nuestros servidores seguros.',
            'El uso de cookies y tecnologías similares para mejorar la experiencia.'
        ]
      },
      'Le recomendamos encarecidamente que lea nuestra Política de Privacidad en su totalidad.'
    ]
  },
  {
    id: 'pagos',
    title: '6. Pagos y Facturación',
    content: [
      'Para nuestros planes de pago, se aplican las siguientes condiciones:',
       {
        list: [
            'Los pagos se realizan anualmente por adelantado.',
            'Las suscripciones se renovarán automáticamente al final de cada período, a menos que se cancelen.',
            'Puede cancelar su suscripción en cualquier momento desde el panel de su cuenta.',
            'No se ofrecen reembolsos por períodos de suscripción parciales o no utilizados.',
        ]
      },
      'Los precios están sujetos a cambios, los cuales se notificarán con al menos 30 días de antelación.'
    ]
  },
  {
    id: 'terminacion',
    title: '7. Terminación del Servicio',
    content: [
      'Podemos terminar o suspender su acceso al Servicio de forma inmediata, sin previo aviso ni responsabilidad, por diversas razones, incluyendo:',
       {
        list: [
            'Violaciones graves o repetidas de estos Términos.',
            'Actividades fraudulentas, ilegales o dañinas.',
            'Falta de pago de las tarifas de suscripción.',
        ]
      },
      'Usted también puede terminar su cuenta en cualquier momento, cesando el uso del Servicio.'
    ]
  },
  {
    id: 'limitaciones',
    title: '8. Limitaciones de Responsabilidad',
    content: [
      'El Servicio se proporciona "tal cual" y "según esté disponible", sin garantías de ningún tipo. No garantizamos:',
      {
        list: [
            'Que el Servicio funcionará de manera ininterrumpida, segura o disponible en cualquier momento o lugar.',
            'Que cualquier error o defecto será corregido de inmediato.',
            'Que el Servicio está libre de virus u otros componentes dañinos.',
        ]
      },
      'En la máxima medida permitida por la ley, Porta QR no será responsable de ningún daño indirecto, incidental, especial o consecuente que resulte del uso o la imposibilidad de usar el Servicio.'
    ]
  }
]

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Términos y Condiciones de Servicio - Porta QR</title>
        <meta name="description" content="Lee los términos y condiciones que rigen el uso de la plataforma Porta QR. Información sobre cuentas, uso aceptable, pagos, privacidad y más." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Header />
      <main className="min-h-screen bg-light-secondary dark:bg-dark-secondary">
        <div className="pt-16">
            <section className="bg-light-primary dark:bg-dark-primary py-16 px-4" aria-labelledby="terms-hero-heading">
            <div className="max-w-7xl mx-auto text-center">
                <h1 id="terms-hero-heading" className="text-4xl md:text-5xl font-bold text-light-primary dark:text-dark-primary mb-4">
                Términos de Servicio
                </h1>
                <p className="text-xl text-light-secondary dark:text-dark-secondary max-w-2xl mx-auto">
                Última actualización: 15 de Marzo, 2024
                </p>
            </div>
            </section>

            <nav className="sticky top-16 bg-white dark:bg-dark-primary border-b border-slate-200 dark:border-slate-800/60 py-3 px-4 z-20" aria-label="Navegación de secciones de términos de servicio">
            <div className="max-w-4xl mx-auto">
                <div className="overflow-x-auto">
                <div className="flex space-x-6 min-w-max">
                    {sections.map((section) => (
                    <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="text-light-secondary dark:text-dark-secondary hover:text-accent-500 dark:hover:text-accent-400 text-sm font-medium whitespace-nowrap"
                    >
                        {section.title}
                    </a>
                    ))}
                </div>
                </div>
            </div>
            </nav>

            <div className="max-w-4xl mx-auto px-4 py-16">
            <div className="bg-white dark:bg-dark-primary rounded-xl shadow-md p-8 md:p-12">
                {sections.map((section) => (
                <section
                    key={section.id}
                    id={section.id}
                    className="mb-12 last:mb-0 scroll-mt-32" // scroll-mt-32 para compensar la altura del nav fijo
                    aria-labelledby={`${section.id}-heading`}
                >
                    <h2 id={`${section.id}-heading`} className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-6 border-b border-gray-200 dark:border-dark-secondary/20 pb-2">
                    {section.title}
                    </h2>
                    <div className="space-y-4 text-light-secondary dark:text-dark-secondary leading-relaxed">
                    {/* MEJORA: Renderizado condicional para párrafos y listas semánticas */}
                    {section.content.map((item, index) => {
                        if (typeof item === 'string') {
                            return <p key={index}>{item}</p>;
                        }
                        return (
                            <ul key={index} className="list-disc list-inside space-y-2 pl-4">
                                {item.list.map((listItem, lIndex) => (
                                <li key={lIndex}>{listItem}</li>
                                ))}
                            </ul>
                        );
                    })}
                    </div>
                </section>
                ))}

                <section className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800/60" aria-labelledby="contact-section-heading">
                <h2 id="contact-section-heading" className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-4">
                    Contacto
                </h2>
                <p className="text-light-secondary dark:text-dark-secondary mb-4">
                    Si tiene preguntas sobre estos Términos de Servicio, puede contactarnos a través de los siguientes canales:
                </p>
                {/* MEJORA: Información de contacto consistente con la marca */}
                <ul className="list-disc list-inside text-light-secondary dark:text-dark-secondary space-y-2">
                    <li>
                        Por correo electrónico: <a href="mailto:contacto@portaqr.cl" className="text-accent-500 hover:underline" aria-label="Enviar correo electrónico a contacto@portaqr.cl">contacto@portaqr.cl</a>
                    </li>
                    <li>
                        A través de nuestro <Link href="/contacto" className="text-accent-500 hover:underline" aria-label="Ir al formulario de contacto">formulario de contacto</Link>.
                    </li>
                    <li>
                        Por correo postal: (Opcional: Añadir dirección si es aplicable a su negocio en Chile)
                    </li>
                </ul>
                </section>
            </div>
            </div>
        </div>
      </main>
      <Footer />
    </>
  )
}