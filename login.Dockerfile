FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY ./functions/login/package*.json ./

RUN npm install --only=production

COPY ./functions/login ./

CMD ["app.handler"]