FROM node:18-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el código fuente
COPY . .

# Exponer el puerto
EXPOSE 3000

# Variables de entorno por defecto (pueden ser sobreescritas por Dokploy/Docker)
ENV PORT=3000

# Comando de inicio
CMD ["npm", "start"]
