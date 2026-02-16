import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad | AXP',
};

export default function PrivacidadPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Política de Privacidad</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Última actualización: 16 de febrero de 2026
      </p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Información que recopilamos</h2>
          <p>
            AXP recopila la siguiente información cuando utilizás nuestro servicio:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Nombre y dirección de correo electrónico (a través de Google OAuth)</li>
            <li>Documentos y facturas que cargás en la plataforma</li>
            <li>Datos de proveedores y transacciones que registrás</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. Uso de la información</h2>
          <p>Utilizamos tu información para:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Autenticarte y darte acceso a tu cuenta</li>
            <li>Procesar y almacenar los documentos que cargás</li>
            <li>Proveer las funcionalidades del servicio (OCR, control de costos, pagos)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Almacenamiento y seguridad</h2>
          <p>
            Tus datos se almacenan de forma segura utilizando servicios de infraestructura
            con encriptación en tránsito y en reposo. No compartimos tu información con
            terceros salvo los proveedores de infraestructura necesarios para operar el
            servicio.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. Tus derechos</h2>
          <p>
            Podés solicitar la eliminación de tu cuenta y todos tus datos en cualquier
            momento contactándonos por correo electrónico.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Contacto</h2>
          <p>
            Para consultas sobre privacidad, escribinos a:{' '}
            <a href="mailto:contacto@axp.com.ar" className="text-primary underline">
              contacto@axp.com.ar
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
