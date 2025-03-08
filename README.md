# Aplicación de Reservas RAPID TICKET

Aplicación serverless para gestión de reservas implementada en AWS utilizando el framework SAM (Serverless Application Model).

Este proyecto implementa un sistema completo de reservas con autenticación de usuarios, gestión de shows/funciones y procesamiento de reservas tanto en tiempo real como de forma asíncrona. La aplicación está diseñada siguiendo principios de arquitectura de microservicios, con una infraestructura completamente definida como código.

## Instalación

Clonar el repositorio

```bash
  git clone https://github.com/TheTGM/rapid-ticket.git
  cd rapid-ticket
```

### Despliegue
A la hora de desplegar, el sistema esta configurado con un CI/CD automatico, que cada vez que hagas un push los cambios se despliegan.

#### Variables de entorno
Las funciones Lambda utilizan las siguientes variables de entorno:

- DB_HOST: Host de la base de datos RDS
- DB_PORT: Puerto de la base de datos
- DB_NAME: Nombre de la base de datos
- DB_USERNAME: Usuario de la base de datos
- DB_PASSWORD: Contraseña de la base de datos
- CACHE_ENDPOINT: Endpoint de ElastiCache Redis
- CACHE_PORT: Puerto de ElastiCache
- QUEUE_URL: URL de la cola SQS
- JWT_SECRET: Clave secreta para tokens JWT

#### Importante: Necesitas configurar los secretos desde el repositorio de github para que se despliguen en tu ambiente.

### Monitoreo y logs

Todas las funciones Lambda están configuradas para enviar logs a CloudWatch. API Gateway también está configurado con logging detallado.

### Seguridad

- API protegida con autorización JWT
- Recursos en VPC con subredes privadas
- Grupos de seguridad restrictos
- Manejo seguro de credenciales
