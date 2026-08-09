'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Header } from "@/components/Header"
import { Footer } from "@/components/Footer"
import { Icon } from "@/components/icon"
import { MailService, ContactForm } from '@/services/mail.service'

export default function ContactPage() {
  const [loading, setLoading] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<ContactForm>()

  const onSubmit = async (data: ContactForm) => {
    setLoading(true)
    try {
      await MailService.sendContactForm(data)
      alert('Mensaje enviado correctamente')
      reset()
    } catch (error) {
      alert('Error al enviar el mensaje. Por favor, intenta nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-16 bg-slate-50 dark:bg-dark-primary transition-colors">
        {/* Hero Section */}
        <section className="pt-8 pb-12 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center space-y-6">
              <h1 className="text-4xl md:text-6xl font-bold text-primary-900 dark:text-dark-primary">
                Contáctanos
              </h1>
              <p className="text-lg md:text-xl text-primary-600 dark:text-dark-secondary max-w-2xl mx-auto">
                Estamos aquí para ayudarte. Envíanos tu mensaje y te responderemos lo antes posible.
              </p>
            </div>
          </div>
        </section>

        {/* Contact Form Section */}
        <section className="py-12 px-4 bg-light-secondary dark:bg-dark-secondary">
          <div className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                  <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Nombre
                  </label>
                  <input
                    type="text"
                    id="nombre"
                    {...register('nombre', { required: 'El nombre es requerido' })}
                    className={`w-full px-4 py-2 rounded-lg border ${errors.nombre
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                      } focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100`}
                  />
                  {errors.nombre && (
                    <p className="mt-1 text-sm text-red-500">{errors.nombre.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    {...register('email', {
                      required: 'El email es requerido',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Email inválido'
                      }
                    })}
                    className={`w-full px-4 py-2 rounded-lg border ${errors.email
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                      } focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100`}
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="asunto" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Asunto
                  </label>
                  <input
                    type="text"
                    id="asunto"
                    {...register('asunto', { required: 'El asunto es requerido' })}
                    className={`w-full px-4 py-2 rounded-lg border ${errors.asunto
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                      } focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100`}
                  />
                  {errors.asunto && (
                    <p className="mt-1 text-sm text-red-500">{errors.asunto.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="mensaje" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Mensaje
                  </label>
                  <textarea
                    id="mensaje"
                    rows={5}
                    {...register('mensaje', { required: 'El mensaje es requerido' })}
                    className={`w-full px-4 py-2 rounded-lg border ${errors.mensaje
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                      } focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none`}
                  />
                  {errors.mensaje && (
                    <p className="mt-1 text-sm text-red-500">{errors.mensaje.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3 px-4 rounded-lg text-white font-medium transition-colors
                    ${loading
                      ? 'bg-primary-400 cursor-not-allowed'
                      : 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800'
                    }`}
                >
                  {loading ? 'Enviando...' : 'Enviar Mensaje'}
                </button>
              </form>

              <div className="mt-12 grid md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-lg bg-accent-500 dark:bg-accent-600 flex items-center justify-center mx-auto mb-4">
                    <Icon name="mail" className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="font-semibold text-light-primary dark:text-dark-primary mb-2">Email</h4>
                  <a href="mailto:contacto@ejemplo.com" className="text-accent-600 dark:text-accent-500 hover:underline">
                    contacto@ejemplo.com
                  </a>
                </div>

                <div className="text-center">
                  <div className="w-12 h-12 rounded-lg bg-accent-500 dark:bg-accent-600 flex items-center justify-center mx-auto mb-4">
                    <Icon name="phone" className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="font-semibold text-light-primary dark:text-dark-primary mb-2">Teléfono</h4>
                  <a href="tel:+1234567890" className="text-accent-600 dark:text-accent-500 hover:underline">
                    +123 456 7890
                  </a>
                </div>

                <div className="text-center">
                  <div className="w-12 h-12 rounded-lg bg-accent-500 dark:bg-accent-600 flex items-center justify-center mx-auto mb-4">
                    <Icon name="map" className="w-6 h-6 text-white" />
                  </div>
                  <h4 className="font-semibold text-light-primary dark:text-dark-primary mb-2">Ubicación</h4>
                  <p className="text-light-tertiary dark:text-dark-tertiary">
                    Talca, Chile
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
} 