'use client'

import { useState } from 'react';
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { useRouter } from 'next/navigation';
import Head from 'next/head';
import Link from 'next/link';

// MEJORA: Tu contenido original, reorganizado, refinado y con una nueva pregunta clave.
const faqCategories = [
  {
    category: "Conceptos Básicos",
    questions: [
      {
        question: "¿Qué es un código QR y cómo puede transformar mi negocio?",
        answer: "Un Código QR (Quick Response) es la clave para desbloquear el potencial digital de tu negocio. Es una herramienta estratégica que conecta a tus clientes con ofertas, contenido interactivo y experiencias de marca. Con nuestros QRs, puedes transformar cada interacción en una oportunidad de venta, fidelización y crecimiento, maximizando tu alcance con tecnología avanzada.",
      },
      {
        question: "¿Cuál es la diferencia entre un código QR estático y uno dinámico?",
        answer: "Un QR estático contiene información fija que no se puede cambiar una vez creado (como una URL directa). Un QR dinámico, en cambio, redirige a una URL que nosotros gestionamos, permitiéndote cambiar el destino del QR en cualquier momento sin reimprimirlo. Además, solo los dinámicos permiten recopilar estadísticas detalladas de escaneo.",
        showPricingLink: true,
      },
    ]
  },
  {
    category: "Uso Comercial y Funcionalidad",
    questions: [
      {
        question: "¿Puedo usar los códigos QR para fines comerciales? ¿Tienen costo?",
        answer: "Sí, absolutamente. Ofrecemos códigos QR estáticos que son completamente gratuitos y puedes usarlos para fines comerciales sin costo. Para funcionalidades avanzadas como la edición de contenido (QR Dinámicos) y el análisis de estadísticas, ofrecemos planes de pago flexibles. Nuestros códigos dinámicos se activan con un pago anual por código, asegurando que solo pagas por lo que necesitas.",
        showPricingLink: true,
      },
      {
        question: "¿Los códigos QR expiran o tienen un límite de escaneos?",
        answer: "No hay límite de escaneos para ningún tipo de QR. Los códigos estáticos (gratuitos) nunca expiran y funcionarán para siempre. Los códigos dinámicos (de pago) permanecen activos mientras su pago anual esté vigente, dándote control total sobre su funcionalidad a largo plazo y la flexibilidad de actualizarlos cuando quieras.",
      },
    ]
  },
  {
    category: "Soporte Técnico y Seguridad",
    questions: [
       {
        question: "¿Por qué mi código QR no se escanea o muestra información incorrecta?",
        answer: "Las razones más comunes incluyen: 1) Errores tipográficos en el contenido (ej. una URL mal escrita). 2) Contraste insuficiente entre el color del código y el fondo (el código siempre debe ser más oscuro). 3) Demasiada información, lo que hace el código muy denso (especialmente en vCards). Verifica estos puntos y, si el problema persiste, nuestro equipo de soporte puede ayudarte.",
      },
      {
        question: "¿Mi información y los datos de mis códigos están seguros?",
        answer: "Tu privacidad y la seguridad de tus datos son nuestra máxima prioridad. Para los códigos QR estáticos, solo guardamos tu correo electrónico para enviarte información relevante sobre nuestros servicios. Para los dinámicos, toda la configuración y las estadísticas se almacenan de forma segura en nuestra plataforma, permitiéndote acceder a ellas cuando lo necesites.",
      },
      {
        question: "¿Qué navegadores son compatibles con la plataforma?",
        answer: "Nuestra plataforma es compatible con todos los navegadores modernos que soporten HTML5. Funciona oficialmente en las últimas versiones de Chrome, Firefox, Safari y Edge, asegurando una experiencia fluida desde cualquier dispositivo.",
      }
    ]
  }
];


export default function FAQPage() {
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<string | null>('0-0'); // Formato: "categoryIndex-questionIndex"

  const toggleFAQ = (index: string) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <>
      <Head>
        <title>Preguntas Frecuentes (FAQ) - Porta QR</title>
        <meta name="description" content="Encuentra respuestas a tus dudas sobre nuestros códigos QR dinámicos y estáticos, límites de escaneo, seguridad de datos y cómo pueden beneficiar a tu negocio." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Header />
      <main className="flex-1 pt-16 bg-slate-50 dark:bg-dark-primary transition-colors">
        
        <section className="pt-8 pb-12 px-4 alternate-bg" aria-labelledby="faq-main-heading">
          <div className="max-w-7xl mx-auto">
            <div className="text-center space-y-6">
              <h1 id="faq-main-heading" className="text-4xl md:text-6xl font-bold text-primary-900 dark:text-dark-primary">
                Preguntas Frecuentes
              </h1>
              <p className="text-lg md:text-xl text-primary-600 dark:text-dark-secondary max-w-2xl mx-auto">
                Resolvemos tus dudas sobre códigos QR y cómo pueden impulsar tu negocio.
              </p>
            </div>
          </div>
        </section>

        <section className="py-12 px-4 alternate-bg">
          <div className="max-w-3xl mx-auto space-y-8">
            {faqCategories.map((category, catIndex) => (
              <div key={catIndex} aria-labelledby={`category-heading-${catIndex}`}>
                <h2 id={`category-heading-${catIndex}`} className="text-2xl font-bold text-light-primary dark:text-dark-primary mb-4 pb-2 border-b border-gray-300 dark:border-dark-secondary/30">
                  {category.category}
                </h2>
                <div className="space-y-4">
                  {category.questions.map((faq, qIndex) => {
                    const currentIndex = `${catIndex}-${qIndex}`;
                    const isOpen = openIndex === currentIndex;

                    return (
                      <div
                        key={currentIndex}
                        className="rounded-xl bg-white dark:bg-dark-primary shadow-sm border border-gray-200 dark:border-dark-secondary/20 overflow-hidden"
                      >
                        <h3 id={`faq-question-${currentIndex}`} className="text-lg font-semibold text-light-primary dark:text-dark-primary">
                          <button
                            className="w-full p-6 text-left flex justify-between items-center"
                            onClick={() => toggleFAQ(currentIndex)}
                            aria-expanded={isOpen}
                            aria-controls={`faq-answer-${currentIndex}`}
                          >
                            <span>{faq.question}</span>
                            <svg
                              className={`w-5 h-5 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                          </button>
                        </h3>
                        <div
                          id={`faq-answer-${currentIndex}`}
                          role="region"
                          aria-labelledby={`faq-question-${currentIndex}`}
                          className="px-6 overflow-hidden transition-all duration-300 ease-in-out"
                          style={{ maxHeight: isOpen ? '1000px' : '0' }}
                        >
                          <div className={isOpen ? 'pb-6' : ''}>
                             <p className="text-light-secondary dark:text-dark-secondary leading-relaxed border-t border-gray-200 dark:border-dark-secondary/20 pt-4">
                                {faq.answer}
                                {faq.showPricingLink && (
                                  <span className='block mt-2'>
                                    Consulta nuestros planes aquí: {' '}
                                    <Link href='/precios' className='text-accent-500 hover:underline font-semibold'>
                                      Ver Precios
                                    </Link>
                                  </span>
                                )}
                              </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-16 px-4" aria-labelledby="cta-faq-heading">
            <div className="max-w-3xl mx-auto text-center">
                <h2 id="cta-faq-heading" className="text-3xl font-bold text-light-primary dark:text-dark-primary mb-4">
                    ¿No encontraste tu respuesta?
                </h2>
                <p className="text-light-secondary dark:text-dark-secondary mb-8">
                    Nuestro equipo está listo para ayudarte. Contáctanos y resolveremos tus dudas personalmente.
                </p>
                <Button 
                    variant="accent" 
                    onClick={() => router.push('/contacto')}
                    aria-label="Contactar al equipo de soporte"
                    className="px-8 py-3 text-lg"
                >
                    Hablar con un experto
                </Button>
            </div>
        </section>
      </main>
      <Footer />
    </>
  );
}