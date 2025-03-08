FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY ./functions/authorizer/package*.json ./

RUN npm install --only=production

COPY ./functions/authorizer ./

CMD ["app.handler"]