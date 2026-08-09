quiero actualizar la estructura de qr.entity.ts en qr-service


  @ApiProperty({
    description: 'URL a la que redirige el QR',
    example: 'https://ejemplo.com/mi-pagina'
  })
  @Prop({ required: true })
  redirectUrl: string;

  esta estructura la quiero remplazar por 

  data: {
    url: string;
    typeQr: string;
  }

  agrega sus propiedades o @prop() y ApiProperty con su descripcion y ejemplo y quiero que sea extencible a nuevas versiones futuras

  if qrtype = dynamic url es mandatorio y tiene que contener http// o https//
  if qrtype = static url es obligatorio y tiene que contener http o https
  if qrtype = whatsapp url es mandatorio y tiene que contener https://wa.me/ seguido de 11 numeros, no puede llevar el simbolo mas, no puede llevar espacios ni - () puede incluir ?text=Hola,%20%C2%BFc%C3%B3mo%20est%C3%A1s? ?text=mensaje mensaje en url formatt
  if qrtype = email url es obligatorio y tiene que contener un @ ademas de deve iniciar por mailto:<mi correo>@<dominio>.<extension> ademas puede ?subject=Asunto%20del%20correo"
  if qrtype = call url es obligatorio y tiene que tener tel: seguido 9 numeros o 11 numeros 
  if qrtype = wifi url es obligatorio y tiene que tener WIFI:S:<Nombre de tu red WiFi>;T:<Tipo de seguridad>;P:<Contraseña de tu red WiFi>;; ,nombre de la tu red es variable y Contraseña de tu red WiFi
  es variable Tipo de seguridad es WPA, WPA2, o WEP
  if qrtype = texto url mandatorio y tiene que tener texto maximo de 10000 caracteres
  if qrtype = list url sera una lista de objetos con {urls,typoUrl} separadas por comas cada url tendra que  tener http// o https// ademas se ra mandatorio
  typoUrl = web, intagram, facebook , youtube, tik tok , cualquier red social que exista 
  if qrtype = vcard tendra los siguientes campos mandatorios VERSION:3.0 N:Apellido;Nombre;;; FN:Nombre Apellido ORG:Nombre de la Organización TITLE:Título del Trabajo TEL;TYPE=WORK,VOICE:+1 111 555 1212 TEL;TYPE=HOME,VOICE:+1 404 555 1212 ADR;TYPE=WORK:;;Dirección de la Oficina;Ciudad;Estado;Código Postal;País EMAIL;TYPE=PREF,INTERNET:correo@ejemplo.com URL:http://www.ejemplo.com PHOTO;VALUE=URL;TYPE=JPEG:http://www.ejemplo.com/foto.jpg NOTE:Notas adicionales sobre el contacto. BDAY:1990-01-01 REV:2025-01-01T00:00:00Z
  if qrtype = pet tendra los siguientes campos los campo mandatorios no lleban signo de ?: NombrePropietario, Direccion, Telefono, NombreMascota, FechaNacimientoEdad?, Raza?, Sexo?, Especie?, DietaFrecuencia?, Enfermedades?, Vacunas?{ nombre?,fecha?}, Observaciones

  
quiero que actualices el dto en qr-service para que sea compatible con los nuevos campos
quiero que apoliques los cambios en el bff-service para que sea compatible con los nuevos campos en el dto
quiero que apoliques los cambios en el qr-app para que sea compatible con los nuevos campos tanto en la api de next como en el servicio

no quiero que elimines logica exsitente en los DTOs ya que son necesarios para la logica existente, solo los nuevos campos NO HACER CAMBIO EN LAS DEMAS LOGICAS Y MANTENER LOS DEMAS CAMPOS esto aplica atodos los poyectos









  if qrtype = dynamic email url es obligatorio y tiene que contener un @ ademas de 

  if qrtype = phone url es obligatorio y tiene que contener un numero seguido de -, no puede llevar el simbolo mas, no puede llevar espacios ni - ()


sapp



