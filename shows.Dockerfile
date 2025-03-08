FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY ./functions/shows/package*.json ./

RUN npm install --only=production

COPY ./functions/shows ./

CMD ["app.handler"]