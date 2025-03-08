FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY ./functions/reservation_processor/package*.json ./

RUN npm install --only=production

COPY ./functions/reservation_processor ./

CMD ["app.handler"]