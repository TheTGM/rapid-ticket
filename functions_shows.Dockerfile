FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY ./functions/functions_shows/package*.json ./

RUN npm install --only=production

COPY ./functions/functions_shows ./

CMD ["app.handler"]