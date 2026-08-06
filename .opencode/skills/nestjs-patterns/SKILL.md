---
name: nestjs-patterns
description: Patrones de arquitectura NestJS para módulos, controladores, providers, validación DTO, guards, interceptors, config y backends TypeScript de producción.
---

# Patrones NestJS

## When to Activate
- Construyendo APIs o servicios NestJS
- Estructurando módulos, controladores y providers
- Agregando validación DTO, guards, interceptors o exception filters
- Configurando variables de entorno y bases de datos
- Testeando unidades NestJS o endpoints HTTP

## Bootstrap y Validación Global

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(process.env.PORT ?? 3000);
}
```

Siempre habilitar `whitelist` y `forbidNonWhitelisted` en APIs públicas.

## Módulos, Controladores y Providers

```typescript
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
```

- Controladores delgados: parsean HTTP, llaman a un provider, devuelven DTOs
- Lógica de negocio en servicios inyectables
- Exportar solo los providers que otros módulos necesiten

## DTOs y Validación

```typescript
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 80)
  name!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
```

- Validar cada request DTO con class-validator
- Usar DTOs de respuesta dedicados en lugar de devolver entidades ORM
- No exponer campos internos como password

## Auth, Guards y Request Context

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Get('admin/report')
getAdminReport(@Req() req: AuthenticatedRequest) {
  return this.reportService.getForUser(req.user.id);
}
```

- Guards module-local a menos que sean compartidos
- Coarse access en guards, autorización específica en servicios

## Exception Filters

```typescript
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();

    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json({
        path: request.url,
        error: exception.getResponse(),
      });
    }

    return response.status(500).json({
      path: request.url,
      error: 'Internal server error',
    });
  }
}
```

## Testing

```typescript
describe('UsersController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
});
```

- Tests unitarios de providers con dependencias mockeadas
- Tests de integración con los mismos pipes globales que producción

## Checklist
- [ ] Global ValidationPipe con whitelist
- [ ] Exception filter consistente
- [ ] DTOs con validación
- [ ] Controladores delgados
- [ ] Tests con mismos pipes que producción
- [ ] Config validada al boot, no lazy
