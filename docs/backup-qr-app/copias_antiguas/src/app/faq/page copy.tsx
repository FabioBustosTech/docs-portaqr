'use client'

import { useState } from 'react';
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-16 bg-slate-50 dark:bg-dark-primary transition-colors">
        {/* Hero Section */}
        <section className="pt-8 pb-12 px-4 alternate-bg">
          <div className="max-w-7xl mx-auto">
            <div className="text-center space-y-6">
              <h2 className="text-4xl md:text-6xl font-bold text-primary-900 dark:text-dark-primary">
                Preguntas Frecuentes
              </h2>
              <p className="text-lg md:text-xl text-primary-600 dark:text-dark-secondary max-w-2xl mx-auto">
                Resolvemos tus dudas sobre códigos QR y cómo pueden beneficiar tu negocio
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section - Accordion Style */}
        <section className="py-12 px-4 alternate-bg">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-1 gap-8">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="p-6 rounded-xl bg-light-primary dark:bg-dark-primary shadow-sm transition-all hover:shadow-lg"
                >
                  <h4
                    className="text-lg font-semibold text-light-primary dark:text-dark-primary mb-3 cursor-pointer flex justify-between items-center"
                    onClick={() => toggleFAQ(index)}
                  >
                    {faq.question}
                    <svg
                      className={`w-5 h-5 transform transition-transform ${openIndex === index ? 'rotate-180' : 'rotate-0'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      ></path>
                    </svg>
                  </h4>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${openIndex === index ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'}`}
                  >
                    <p className="text-light-secondary dark:text-dark-secondary leading-relaxed pt-2">
                      {faq.answer}
                      { faq.showPricingLink &&
                      <>
                        <span>Consulta nuestros precios aquí: </span>
                        <a href='/precios' className='text-accent-500 hover:underline'>Precios</a>

                      </>
                      }
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

const faqs = [
  {
    question: "¿Qué es un código QR y cómo puede transformar tu negocio?",
    answer: "Un Código QR (Quick Response) es la clave para desbloquear el potencial digital de tu negocio. Va más allá de un simple escaneo; es una herramienta estratégica que conecta a tus clientes directamente con ofertas exclusivas, contenido interactivo, y experiencias de marca inmersivas. Con nuestros QRs, transforma cada interacción en una oportunidad de venta, fidelización y crecimiento. ¡Maximiza tu alcance y optimiza tus campañas con la tecnología QR más avanzada!",
  },
  {
    question: "¿Puedo utilizar los códigos QR generados para fines comerciales?",
    answer: "Ofrecemos códigos QR estáticos gratuitos, ideales para uso comercial básico. Estos códigos son permanentes y no tienen costo. Para funcionalidades avanzadas como códigos QR dinámicos, seguimiento de estadísticas, y la posibilidad de editar el contenido después de la creación, ofrecemos opciones de pago. Los códigos dinámicos y otras variantes avanzadas solo están funcionales mientras tu pago se encuentre activo. ",
    showPricingLink: true,
  },
  {
    question: "¿Cómo se activan los códigos QR dinámicos?",
    answer: "Los códigos QR estáticos no requieren activación y funcionan inmediatamente. Para los códigos QR dinámicos, la activación se realiza mediante un pago individual por cada código. No manejamos suscripciones generales, sino que cada QR dinámico se activa y mantiene funcional a través de un pago específico, asegurando que solo pagas por lo que necesitas y cuando lo necesitas. ",
    showPricingLink: true,
  },
  {
    question: "¿Expiran los códigos QR generados?",
    answer: "Los códigos QR estáticos que generas son permanentes y no caducan, lo que garantiza su funcionalidad a largo plazo. Sin embargo, su contenido no puede ser modificado una vez creados. Para una flexibilidad total, nuestros códigos QR dinámicos te permiten actualizar el contenido en cualquier momento, y su funcionalidad se mantiene activa mientras tu pago esté vigente. ¡Elige la opción que mejor se adapte a tus necesidades de marketing!",
    showPricingLink: true,
  },
  {
    question: "¿Hay un límite de lecturas para los códigos QR?",
    answer: "Para los códigos QR estáticos, no hay límite en la cantidad de veces que pueden ser escaneados. Puedes compartirlos y utilizarlos sin restricciones. Sin embargo, si buscas obtener datos valiosos sobre el rendimiento de tus campañas, como el número de escaneos, la ubicación y el dispositivo, nuestros códigos QR dinámicos (disponibles con planes de pago) te ofrecen estadísticas detalladas para optimizar tus estrategias de marketing.",
    showPricingLink: true,
  },
  {
    question: "¿Se conservan mis datos y la información de mis códigos QR?",
    answer: "Para los códigos QR estáticos, no conservamos ningún dato personal ni de uso; solo tu correo electrónico se guarda con el fin de enviarte información relevante. Para los códigos QR dinámicos, la configuración de tu código y todas sus estadísticas de escaneo se conservan de forma segura en nuestra plataforma, incluso si el código se desactiva temporalmente. Esto te permite acceder a información valiosa y reactivar tus campañas en cualquier momento.",
    showPricingLink: true,
  },
  {
    question: "¿Por qué no muestra los campos correctos mi código QR?",
    answer: "Pueden existir varias razones: errores ortográficos en la URL, demasiada información en el código (como en vCards), o problemas de contraste. Asegúrate de que el frente sea más oscuro que el fondo y considera reducir la cantidad de datos si es posible.",
  },
  {
    question: "¿En qué navegadores funciona?",
    answer: "Nuestro sistema necesita un navegador HTML5 compatible y funciona oficialmente en Chrome, Firefox, Safari, Edge así como Internet Explorer 11.",
  },
  {
    question: "¿Cómo pueden los códigos QR impulsar mi negocio?",
    answer: "Los códigos QR son herramientas versátiles que conectan el mundo físico con el digital. Permiten a tus clientes acceder instantáneamente a tu sitio web, promociones, menús, redes sociales y mucho más, mejorando la interacción y la eficiencia de tus campañas de marketing. Para funcionalidades avanzadas y estadísticas detalladas, ",
    showPricingLink: true,
  },
  {
    question: "¿Puedo usar los códigos QR generados para fines comerciales sin costo adicional?",
    answer: "Sí, puedes utilizar nuestros códigos QR estáticos gratuitos para fines comerciales sin costo adicional. Son perfectos para necesidades básicas y permanentes. Sin embargo, para acceder a funcionalidades avanzadas como códigos QR dinámicos, seguimiento de estadísticas detalladas y la capacidad de modificar el contenido en cualquier momento, ofrecemos planes de pago. Los códigos dinámicos y otras variantes avanzadas están diseñados para maximizar tu estrategia comercial y solo están activos mientras tu plan esté vigente.",
    showPricingLink: true,
  },
  {
    question: "¿Mis códigos QR generados tienen fecha de caducidad o límites de escaneo?",
    answer: "No, tus códigos QR estáticos son permanentes y no caducan. Una vez generados, seguirán funcionando indefinidamente. Sin embargo, ten en cuenta que el contenido de los códigos estáticos no se puede modificar después de su creación. Para flexibilidad y actualizaciones, considera nuestros códigos QR dinámicos.",
    showPricingLink: true,
  },
  {
    question: "¿Hay un límite en la cantidad de veces que se pueden escanear mis códigos QR?",
    answer: "¡No hay límites! Tus códigos QR pueden ser escaneados un número ilimitado de veces. Esto te asegura una máxima exposición y alcance para tus campañas sin preocuparte por restricciones.",
    showPricingLink: true,
  },
  {
    question: "¿Mi información personal y los datos de mis códigos QR están seguros?",
    answer: "Tu privacidad y la seguridad de tus datos son nuestra máxima prioridad. Para los códigos QR estáticos, no conservamos ningún dato personal ni de uso; solo tu correo electrónico se guarda con el fin de enviarte información relevante. Para los códigos QR dinámicos, la configuración de tu código y todas sus estadísticas de escaneo se conservan de forma segura en nuestra plataforma, incluso si el código se desactiva temporalmente. Esto te permite acceder a información valiosa y reactivar tus campañas en cualquier momento.",
    showPricingLink: true,
  },
  {
    question: "¿Por qué mi código QR no se escanea correctamente o muestra información errónea?",
    answer: "Las razones más comunes incluyen errores tipográficos en la URL, demasiada información en el código (como en vCards), o problemas de contraste. Asegúrate de que el frente sea más oscuro que el fondo y considera simplificar el contenido si es muy denso. Nuestro sistema está diseñado para la máxima compatibilidad, pero una buena práctica de diseño es clave.",
  },
  {
    question: "¿Qué navegadores son compatibles con su plataforma de generación de QR?",
    answer: "Nuestra plataforma está optimizada para una amplia gama de navegadores modernos. Funciona oficialmente en Chrome, Firefox, Safari, Edge, y es compatible con cualquier navegador HTML5. Esto asegura que puedas crear y gestionar tus códigos QR desde prácticamente cualquier dispositivo.",
  }
];