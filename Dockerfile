FROM node:22 as Builder

WORKDIR /action

COPY .yarn/ ./.yarn/
COPY package.json yarn.lock .yarnrc.yml ./

COPY .papi ./.papi

RUN yarn install --immutable

COPY . .

RUN yarn run build

ENTRYPOINT ["node", "/action/dist/index.js"]
