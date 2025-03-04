FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

# Copiar package.json primero
COPY ./functions/authorizer/package*.json ./

# Instalar dependencias
RUN npm install --only=production

# Resto de archivos
COPY ./functions/authorizer ./
# COPY ./model/entities ./model/entities
# COPY ./model/services ./model/services
# COPY ./model/utils ./model/utils

CMD ["app.handler"]