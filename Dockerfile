FROM node:22 as Builder

WORKDIR /action

COPY .yarn/ ./.yarn/
COPY package.json yarn.lock .yarnrc.yml ./

COPY collectives.scale polkadot.scale polkadot-api.json ./

RUN yarn install --immutable

COPY . .

RUN yarn run build

FROM node:22-slim

COPY --from=Builder /action/dist /action

ENTRYPOINT ["node", "/action/index.js"]
