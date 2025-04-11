FROM node:18

# Define diretório de trabalho
WORKDIR /usr/src/app

# Copia arquivos de dependência
COPY package*.json ./

# Instala dependências
RUN npm install

# Copia o restante da aplicação
COPY . .

# Cria pastas utilizadas
RUN mkdir -p uploads exports

# Expondo a porta do app
EXPOSE 3000

# Comando de inicialização usando o script npm run dev
CMD ["npm", "run", "dev"]
